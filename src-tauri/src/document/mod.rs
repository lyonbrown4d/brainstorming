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
mod resource_insert;
mod resource_reader;
mod resource_write;
pub(crate) mod resources;
mod save;
pub(crate) mod schema;
mod source;
mod structure;
mod structure_read;
mod structure_read_parts;
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
use std::{io::Cursor, path::Path, sync::Arc};
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
            .run(path, password, false, |db| Box::pin(structure::read(db)))
            .await
    }
    pub async fn revisions(
        &self,
        path: impl AsRef<Path>,
        password: Option<&str>,
    ) -> Result<Vec<Revision>> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry
            .run(path, password, false, |db| {
                Box::pin(maintenance::revisions(db))
            })
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
                Box::pin(async move { maintenance::read_revision(db, &id).await })
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
                Box::pin(async move {
                    let workbook = maintenance::read_revision(db, &id).await?;
                    write::write(db, workbook, None).await
                })
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
                Box::pin(async move { resources::read_range(db, &id, offset, length).await })
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
                Box::pin(async move {
                    Ok(ResourceObject {
                        byte_length: resources::size(db, &id).await?,
                        object_id: id,
                    })
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
                Box::pin(async move { resources::derivatives(db, &id).await })
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
                Box::pin(async move { resources::image_tile(db, &id, level, x, y).await })
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
        mut reader: resources::ResourceReader,
        password: Option<&str>,
    ) -> Result<ResourceObject> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry
            .run(path, password, false, move |db| {
                Box::pin(async move {
                    use sqlx::Connection;
                    let mut tx = db.begin_with("BEGIN IMMEDIATE").await?;
                    let object = resources::insert(&mut tx, &mut reader, None).await?;
                    tx.commit().await?;
                    Ok(object)
                })
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
                Box::pin(async move { maintenance::compact(db, &pinned).await })
            })
            .await
    }
    pub async fn retain(&self, path: impl AsRef<Path>, password: Option<&str>) -> Result<()> {
        let (path, mut entry) = pool::lock(path.as_ref()).await?;
        entry
            .run(path, password, false, |_| Box::pin(async { Ok(()) }))
            .await?;
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
        Ok(Arc::new(DocumentSource::new(path, password).await?) as Arc<dyn ResourceSource>)
    }
}
