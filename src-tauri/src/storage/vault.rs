use crate::document::{self, Derivatives, ResourceObject, ResourceSource, Result};
use std::{
    io::{Cursor, Read},
    path::Path,
    sync::{Arc, Mutex},
};
use tempfile::NamedTempFile;
use zeroize::Zeroizing;

struct VaultInner {
    // Close the database before unlinking its file, including on Windows.
    db: Mutex<Option<rusqlite::Connection>>,
    file: Mutex<Option<NamedTempFile>>,
}
#[derive(Clone)]
pub struct ResourceVault {
    inner: Arc<VaultInner>,
}

impl ResourceVault {
    /// A random key exists only in native memory. Staged bytes never land in a
    /// plaintext temporary file, including before a document receives a password.
    pub async fn new(directory: impl AsRef<Path>) -> Result<Self> {
        let directory = directory.as_ref().to_owned();
        tokio::task::spawn_blocking(move || Self::create(directory))
            .await
            .map_err(|_| document::DocumentError::Worker)?
    }
    fn create(directory: impl AsRef<Path>) -> Result<Self> {
        std::fs::create_dir_all(directory.as_ref())?;
        let file = NamedTempFile::new_in(directory)?;
        let password = Zeroizing::new(format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4()));
        let mut db = rusqlite::Connection::open(file.path())?;
        document::schema::configure(&db, Some(password.as_str()))?;
        document::schema::initialize(&mut db, true)?;
        Ok(Self {
            inner: Arc::new(VaultInner {
                file: Mutex::new(Some(file)),
                db: Mutex::new(Some(db)),
            }),
        })
    }
    async fn run<T, F>(&self, operation: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut rusqlite::Connection) -> Result<T> + Send + 'static,
    {
        let inner = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let mut db = inner
                .db
                .lock()
                .map_err(|_| document::DocumentError::Worker)?;
            operation(
                db.as_mut()
                    .ok_or_else(|| document::DocumentError::Invalid("资源暂存服务已关闭".into()))?,
            )
        })
        .await
        .map_err(|_| document::DocumentError::Worker)?
    }
    /// Call after producers have drained; close and delete happen on a blocking worker.
    pub async fn shutdown(&self) -> Result<()> {
        let inner = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let mut db = inner
                .db
                .lock()
                .map_err(|_| document::DocumentError::Worker)?;
            if let Some(connection) = db.take() {
                connection.close().map_err(|(_, error)| error)?;
            }
            if let Some(file) = inner
                .file
                .lock()
                .map_err(|_| document::DocumentError::Worker)?
                .take()
            {
                file.close()?;
            }
            Ok(())
        })
        .await
        .map_err(|_| document::DocumentError::Worker)?
    }
    pub async fn import_file(&self, path: impl AsRef<Path>) -> Result<ResourceObject> {
        let path = path.as_ref().to_owned();
        self.run(move |db| {
            let mut file = std::fs::File::open(path)?;
            let tx = db.transaction()?;
            let object = document::resources::insert(&tx, &mut file, None)?;
            tx.commit()?;
            Ok(object)
        })
        .await
    }
    pub async fn import_bytes(&self, bytes: Vec<u8>) -> Result<ResourceObject> {
        self.run(move |db| {
            let tx = db.transaction()?;
            let object = document::resources::insert(&tx, &mut Cursor::new(bytes), None)?;
            tx.commit()?;
            Ok(object)
        })
        .await
    }
    pub async fn read_range(&self, id: &str, offset: u64, length: Option<u64>) -> Result<Vec<u8>> {
        let id = id.to_owned();
        self.run(move |db| document::resources::read_range(db, &id, offset, length))
            .await
    }
    pub async fn object_info(&self, id: &str) -> Result<ResourceObject> {
        let id = id.to_owned();
        self.run(move |db| {
            Ok(ResourceObject {
                byte_length: document::resources::size(db, &id)?,
                object_id: id,
            })
        })
        .await
    }
    pub async fn derivatives(&self, id: &str) -> Result<Derivatives> {
        let id = id.to_owned();
        self.run(move |db| document::resources::derivatives(db, &id))
            .await
    }
    pub async fn image_tile(&self, id: &str, level: u32, x: u32, y: u32) -> Result<Option<String>> {
        let id = id.to_owned();
        self.run(move |db| document::resources::image_tile(db, &id, level, x, y))
            .await
    }
    pub async fn set_derivatives(&self, id: &str, derivatives: Derivatives) -> Result<()> {
        let id = id.to_owned();
        self.run(move |db| {
            let tx = db.transaction()?;
            document::resources::link_derivatives(&tx, &id, &derivatives)?;
            tx.commit()?;
            Ok(())
        })
        .await
    }
}
impl ResourceSource for ResourceVault {
    fn open(&self, id: &str) -> Result<Box<dyn Read + Send>> {
        let db = self
            .inner
            .db
            .lock()
            .map_err(|_| document::DocumentError::Worker)?;
        let total = document::resources::size(
            db.as_ref()
                .ok_or_else(|| document::DocumentError::Invalid("资源暂存服务已关闭".into()))?,
            id,
        )?;
        Ok(Box::new(VaultReader {
            owner: self.inner.clone(),
            id: id.to_owned(),
            offset: 0,
            total,
            pending: Cursor::new(Vec::new()),
        }))
    }
    fn derivatives(&self, id: &str) -> Result<Derivatives> {
        let db = self
            .inner
            .db
            .lock()
            .map_err(|_| document::DocumentError::Worker)?;
        document::resources::derivatives(
            db.as_ref()
                .ok_or_else(|| document::DocumentError::Invalid("资源暂存服务已关闭".into()))?,
            id,
        )
    }
}
struct VaultReader {
    owner: Arc<VaultInner>,
    id: String,
    offset: u64,
    total: u64,
    pending: Cursor<Vec<u8>>,
}
impl Read for VaultReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }
        if self.pending.position() as usize == self.pending.get_ref().len() {
            if self.offset >= self.total {
                return Ok(0);
            }
            let length = (self.total - self.offset).min(document::RESOURCE_CHUNK_BYTES as u64);
            let db = self
                .owner
                .db
                .lock()
                .map_err(|_| std::io::Error::other("资源暂存连接不可用"))?;
            let chunk = document::resources::read_range(
                db.as_ref()
                    .ok_or_else(|| std::io::Error::other("资源暂存服务已关闭"))?,
                &self.id,
                self.offset,
                Some(length),
            )
            .map_err(std::io::Error::other)?;
            self.offset += chunk.len() as u64;
            self.pending = Cursor::new(chunk);
        }
        self.pending.read(buffer)
    }
}
