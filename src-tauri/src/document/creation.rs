use super::{ResourceSource, Result, error::invalid, schema, structure, write};
use serde_json::Value;
use sqlx::Connection;
use std::{path::PathBuf, sync::Arc};

/// Publish only a complete, closed and synced database; never clobber a file
/// concurrently created by another application.
pub(crate) async fn write_new(
  path: PathBuf,
  password: Option<&str>,
  workbook: Value,
  source: Option<Arc<dyn ResourceSource>>,
) -> Result<Value> {
  let parent = path
    .parent()
    .ok_or_else(|| invalid("文件目录无效"))?
    .to_owned();
  let temporary = tokio::task::spawn_blocking(move || tempfile::NamedTempFile::new_in(parent))
    .await
    .map_err(|_| super::DocumentError::Worker)??;
  let mut db = schema::connect(temporary.path(), password, true, false).await?;
  let result = async {
    let workbook = write::write(&mut db, workbook, source.as_deref()).await?;
    structure::read(&mut db).await?;
    Ok::<_, super::DocumentError>(workbook)
  }
  .await;
  db.close().await?;
  let workbook = result?;
  tokio::task::spawn_blocking(move || {
        temporary.as_file().sync_all()?;
        temporary.persist_noclobber(&path).map_err(|error| error.error)?;
        #[cfg(unix)]
        if let Err(error) = std::fs::File::open(path.parent().unwrap()).and_then(|dir| dir.sync_all()) {
            tracing::warn!(error_kind=?error.kind(),"Native creation committed; directory sync unavailable");
        }
        Ok(workbook)
    }).await.map_err(|_| super::DocumentError::Worker)?
}
