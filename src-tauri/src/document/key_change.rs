use super::{ResourceSource, Result, error::invalid, pool::Entry, schema, structure, write};
use serde_json::Value;
use sqlx::{Connection, SqliteConnection};
use std::{path::PathBuf, sync::Arc};
use tempfile::NamedTempFile;
use zeroize::Zeroizing;

/// Export with SQLCipher, validate and close both databases before atomically
/// replacing the original. Failures never publish the partially exported file.
pub(crate) async fn replace(
    entry: &mut Entry,
    path: PathBuf,
    previous: Option<&str>,
    password: Option<&str>,
    workbook: Option<Value>,
    source: Option<Arc<dyn ResourceSource>>,
) -> Result<Option<Value>> {
    entry.close().await?;
    let parent = path
        .parent()
        .ok_or_else(|| invalid("文件目录无效"))?
        .to_owned();
    let temporary = tokio::task::spawn_blocking(move || NamedTempFile::new_in(parent))
        .await
        .map_err(|_| super::DocumentError::Worker)??;
    let key = Zeroizing::new(password.unwrap_or_default().to_owned());
    let mut original = schema::connect(&path, previous, false, false).await?;
    let exported = export(&mut original, &temporary, key.as_str()).await;
    // Always await native close before temporary file cleanup, even on errors.
    original.close().await?;
    exported?;
    let mut replacement =
        schema::connect(temporary.path(), Some(key.as_str()), false, false).await?;
    let result = async {
        let result = match workbook {
            Some(workbook) => {
                Some(write::write(&mut replacement, workbook, source.as_deref()).await?)
            }
            None => None,
        };
        structure::read(&mut replacement).await?;
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&mut replacement)
            .await?;
        if integrity != "ok" {
            return Err(invalid("密码变更后的数据库校验失败"));
        }
        Ok::<_, super::DocumentError>(result)
    }
    .await;
    replacement.close().await?;
    let result = result?;
    tokio::task::spawn_blocking(move || {
        temporary.as_file().sync_all()?;
        temporary.persist(&path).map_err(|error| error.error)?;
        #[cfg(unix)]
        if let Err(error) = std::fs::File::open(path.parent().unwrap()).and_then(|dir| dir.sync_all()) {
            tracing::warn!(error_kind=?error.kind(),"Native replacement committed; directory sync unavailable");
        }
        Ok(result)
    }).await.map_err(|_| super::DocumentError::Worker)?
}

async fn export(db: &mut SqliteConnection, temporary: &NamedTempFile, key: &str) -> Result<()> {
    let filename = temporary
        .path()
        .to_str()
        .ok_or_else(|| invalid("临时文件路径编码无效"))?;
    sqlx::query("ATTACH DATABASE ?1 AS native_key_export KEY ?2")
        .bind(filename)
        .bind(key)
        .execute(&mut *db)
        .await?;
    let exported = async {
        let mut tx = db.begin_with("BEGIN IMMEDIATE").await?;
        sqlx::query("SELECT sqlcipher_export('native_key_export')")
            .execute(&mut *tx)
            .await?;
        // The SQLx migration ledger is copied by sqlcipher_export with the data.
        schema::stamp_file_identity(&mut tx, true).await?;
        tx.commit().await?;
        Ok::<_, super::DocumentError>(())
    }
    .await;
    // Transaction drop queues a rollback before this detach on the same worker.
    let detached = sqlx::query("DETACH DATABASE native_key_export")
        .execute(&mut *db)
        .await;
    exported?;
    detached?;
    Ok(())
}
