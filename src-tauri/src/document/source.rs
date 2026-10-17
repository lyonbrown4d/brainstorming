use super::{Derivatives, ResourceSource, Result, error::invalid, pool, resources, schema};
use rusqlite::Connection;
use std::{
    io::{Cursor, Read},
    path::{Path, PathBuf},
    sync::Arc,
};
use zeroize::Zeroizing;

pub struct DocumentSource {
    path: PathBuf,
    password: Zeroizing<String>,
}
impl DocumentSource {
    pub fn new(path: impl AsRef<Path>, password: Option<&str>) -> Result<Self> {
        Ok(Self {
            path: pool::canonical(path.as_ref())?,
            password: Zeroizing::new(password.unwrap_or_default().to_owned()),
        })
    }
    fn connection(&self) -> Result<Connection> {
        let mut db =
            Connection::open_with_flags(&self.path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        schema::configure(&db, Some(self.password.as_str()))?;
        schema::initialize(&mut db, false)?;
        Ok(db)
    }
}
impl ResourceSource for DocumentSource {
    fn open(&self, id: &str) -> Result<Box<dyn Read + Send>> {
        let db = self.connection()?;
        db.execute_batch("BEGIN DEFERRED")?;
        let total = resources::size(&db, id)?;
        Ok(Box::new(ObjectReader {
            db,
            id: id.to_owned(),
            total,
            offset: 0,
            pending: Cursor::new(Vec::new()),
        }))
    }
    fn derivatives(&self, id: &str) -> Result<Derivatives> {
        resources::derivatives(&self.connection()?, id)
    }
}

/// One authenticated chunk is held in native memory; a read transaction pins
/// the source snapshot while another document is populated.
struct ObjectReader {
    db: Connection,
    id: String,
    total: u64,
    offset: u64,
    pending: Cursor<Vec<u8>>,
}
impl Read for ObjectReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }
        if self.pending.position() as usize == self.pending.get_ref().len() {
            if self.offset >= self.total {
                return Ok(0);
            }
            let length = (self.total - self.offset).min(resources::RESOURCE_CHUNK_BYTES as u64);
            let chunk = resources::read_range(&self.db, &self.id, self.offset, Some(length))
                .map_err(std::io::Error::other)?;
            self.offset += chunk.len() as u64;
            self.pending = Cursor::new(chunk);
        }
        self.pending.read(buffer)
    }
}

pub struct CompositeSource {
    sources: Vec<Arc<dyn ResourceSource>>,
}
impl CompositeSource {
    pub fn new(sources: Vec<Arc<dyn ResourceSource>>) -> Self {
        Self { sources }
    }
}
impl ResourceSource for CompositeSource {
    fn open(&self, id: &str) -> Result<Box<dyn Read + Send>> {
        for source in &self.sources {
            if let Ok(reader) = source.open(id) {
                return Ok(reader);
            }
        }
        Err(invalid("资源对象来源不可用"))
    }
    fn derivatives(&self, id: &str) -> Result<Derivatives> {
        for source in &self.sources {
            if source.open(id).is_ok() {
                return source.derivatives(id);
            }
        }
        Err(invalid("资源派生对象来源不可用"))
    }
}
