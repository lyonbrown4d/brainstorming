mod asset_validation;
mod classify;
pub use classify::is_encrypted;
mod content_validation;
mod creation;
mod error;
mod inline_validation;
mod key_change;
mod maintenance;
mod pool;
mod presentation_validation;
mod resource_write;
pub(crate) mod resources;
pub(crate) mod schema;
mod source;
mod structure;
mod structure_read;
mod validation;
mod write;

pub use error::{DocumentError, Result};
pub use maintenance::Revision;
pub use resources::{
    Derivatives, MAX_RANGE_BYTES, Preview, RESOURCE_CHUNK_BYTES, ResourceObject, ResourceSource,
    Tile,
};
use serde_json::Value;
pub use source::{CompositeSource, DocumentSource};
use std::{
    io::{Cursor, Read},
    path::Path,
    sync::Arc,
};
pub use validation::validate_workbook;

#[derive(Clone, Default)]
pub struct DocumentStore;
impl DocumentStore {
    pub fn new() -> Self {
        Self
    }
    pub async fn shutdown(&self) -> Result<()> {
        pool::shutdown().await
    }
    pub async fn read(&self, path: impl AsRef<Path>, password: Option<&str>) -> Result<Value> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry
            .run(path, password, false, |db| structure::read(db))
            .await
    }
    pub async fn write(
        &self,
        path: impl AsRef<Path>,
        workbook: Value,
        password: Option<&str>,
        existing_password: Option<&str>,
        source: Option<Arc<dyn ResourceSource>>,
    ) -> Result<Value> {
        let workbook = tokio::task::spawn_blocking(move || {
            validation::validate_workbook(&workbook)?;
            Ok::<_, DocumentError>(workbook)
        })
        .await
        .map_err(|_| DocumentError::Worker)??;
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        if !tokio::fs::try_exists(&path).await? {
            entry.close().await?;
            return creation::write_new(path, password, workbook, source).await;
        }
        if password.unwrap_or_default() != existing_password.unwrap_or_default() {
            return key_change::replace(
                &mut entry,
                path,
                existing_password,
                password,
                Some(workbook),
                source,
            )
            .await?
            .ok_or_else(|| error::invalid("密码变更缺少工作簿"));
        }
        entry
            .run(path, password, false, move |db| {
                write::write(db, workbook, source.as_deref())
            })
            .await
    }

    pub async fn rekey(
        &self,
        path: impl AsRef<Path>,
        previous: Option<&str>,
        password: Option<&str>,
    ) -> Result<()> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        if previous.unwrap_or_default() == password.unwrap_or_default() {
            return entry
                .run(path, previous, false, |db| structure::read(db).map(|_| ()))
                .await;
        }
        key_change::replace(&mut entry, path, previous, password, None, None).await?;
        Ok(())
    }
    pub async fn revisions(
        &self,
        path: impl AsRef<Path>,
        password: Option<&str>,
    ) -> Result<Vec<Revision>> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry
            .run(path, password, false, |db| maintenance::revisions(db))
            .await
    }
    pub async fn read_revision(
        &self,
        path: impl AsRef<Path>,
        id: &str,
        password: Option<&str>,
    ) -> Result<Value> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        let id = id.to_owned();
        entry
            .run(path, password, false, move |db| {
                maintenance::read_revision(db, &id)
            })
            .await
    }
    pub async fn restore_revision(
        &self,
        path: impl AsRef<Path>,
        id: &str,
        password: Option<&str>,
    ) -> Result<Value> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        let id = id.to_owned();
        entry
            .run(path, password, false, move |db| {
                let workbook = maintenance::read_revision(db, &id)?;
                write::write(db, workbook, None)
            })
            .await
    }
    pub async fn read_resource(
        &self,
        path: impl AsRef<Path>,
        id: &str,
        offset: u64,
        length: Option<u64>,
        password: Option<&str>,
    ) -> Result<Vec<u8>> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        let id = id.to_owned();
        entry
            .run(path, password, false, move |db| {
                resources::read_range(db, &id, offset, length)
            })
            .await
    }
    pub async fn resource_info(
        &self,
        path: impl AsRef<Path>,
        id: &str,
        password: Option<&str>,
    ) -> Result<ResourceObject> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        let id = id.to_owned();
        entry
            .run(path, password, false, move |db| {
                Ok(ResourceObject {
                    byte_length: resources::size(db, &id)?,
                    object_id: id,
                })
            })
            .await
    }
    pub async fn resource_derivatives(
        &self,
        path: impl AsRef<Path>,
        id: &str,
        password: Option<&str>,
    ) -> Result<Derivatives> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        let id = id.to_owned();
        entry
            .run(path, password, false, move |db| {
                resources::derivatives(db, &id)
            })
            .await
    }
    pub async fn image_tile(
        &self,
        path: impl AsRef<Path>,
        id: &str,
        level: u32,
        x: u32,
        y: u32,
        password: Option<&str>,
    ) -> Result<Option<String>> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        let id = id.to_owned();
        entry
            .run(path, password, false, move |db| {
                resources::image_tile(db, &id, level, x, y)
            })
            .await
    }
    pub async fn import_resource(
        &self,
        path: impl AsRef<Path>,
        bytes: Vec<u8>,
        password: Option<&str>,
    ) -> Result<ResourceObject> {
        self.import_reader(path, Box::new(Cursor::new(bytes)), password)
            .await
    }
    pub async fn import_reader(
        &self,
        path: impl AsRef<Path>,
        mut reader: Box<dyn Read + Send>,
        password: Option<&str>,
    ) -> Result<ResourceObject> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry
            .run(path, password, false, move |db| {
                let tx = db.transaction()?;
                let object = resources::insert(&tx, &mut reader, None)?;
                tx.commit()?;
                Ok(object)
            })
            .await
    }
    /// Explicit maintenance: include every object referenced by unsaved and undo
    /// state. Current workbook, retained revisions and their derivatives stay pinned.
    pub async fn compact(
        &self,
        path: impl AsRef<Path>,
        pinned: Vec<String>,
        password: Option<&str>,
    ) -> Result<u64> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry
            .run(path, password, false, move |db| {
                maintenance::compact(db, &pinned)
            })
            .await
    }
    pub async fn retain(&self, path: impl AsRef<Path>, password: Option<&str>) -> Result<()> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry.run(path, password, false, |_| Ok(())).await?;
        entry.references = entry
            .references
            .checked_add(1)
            .ok_or_else(|| error::invalid("文档引用数量溢出"))?;
        Ok(())
    }
    pub async fn release(&self, path: impl AsRef<Path>) -> Result<()> {
        let (_, mut entry) = pool::lock(path.as_ref()).await?;
        entry.references = entry.references.saturating_sub(1);
        if entry.references == 0 {
            entry.close().await?;
        }
        Ok(())
    }
    pub async fn source(
        &self,
        path: impl AsRef<Path>,
        password: Option<&str>,
    ) -> Result<Arc<dyn ResourceSource>> {
        let path = path.as_ref().to_owned();
        let password = zeroize::Zeroizing::new(password.unwrap_or_default().to_owned());
        tokio::task::spawn_blocking(move || {
            Ok(
                Arc::new(DocumentSource::new(path, Some(password.as_str()))?)
                    as Arc<dyn ResourceSource>,
            )
        })
        .await
        .map_err(|_| DocumentError::Worker)?
    }
}
