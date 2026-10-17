use super::{ResourceSource, Result, error::invalid, schema, structure, write};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};
use zeroize::Zeroizing;

/// Publish a new file only after its complete encrypted transaction succeeds.
/// persist_noclobber also protects a file created concurrently by another app.
pub(crate) async fn write_new(
    path: PathBuf,
    password: Option<&str>,
    workbook: Value,
    source: Option<Arc<dyn ResourceSource>>,
) -> Result<Value> {
    let password = Zeroizing::new(password.unwrap_or_default().to_owned());
    tokio::task::spawn_blocking(move||{
        let parent=path.parent().ok_or_else(||invalid("文件目录无效"))?;
        let temporary=tempfile::NamedTempFile::new_in(parent)?;
        let mut db=rusqlite::Connection::open(temporary.path())?;
        schema::configure(&db,Some(password.as_str()))?;
        schema::initialize(&mut db,true)?;
        let workbook=write::write(&mut db,workbook,source.as_deref())?;
        structure::read(&db)?;
        db.close().map_err(|(_,error)|error)?;
        temporary.as_file().sync_all()?;
        temporary.persist_noclobber(&path).map_err(|error|error.error)?;
        #[cfg(unix)]
        if let Err(error)=std::fs::File::open(parent).and_then(|directory|directory.sync_all()) {
            tracing::warn!(error_kind=?error.kind(),"Native creation committed; directory sync unavailable");
        }
        Ok(workbook)
    }).await.map_err(|_|super::DocumentError::Worker)?
}
