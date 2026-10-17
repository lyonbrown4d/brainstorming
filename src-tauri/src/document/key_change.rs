use super::{ResourceSource, Result, error::invalid, pool::Entry, schema, structure, write};
use rusqlite::{Connection, params};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};
use tempfile::NamedTempFile;
use zeroize::Zeroizing;

/// SQLCipher export supports both plaintext/encrypted transitions. The source is
/// untouched until a complete replacement has been validated and synced.
pub(crate) async fn replace(
    entry: &mut Entry,
    path: PathBuf,
    previous: Option<&str>,
    password: Option<&str>,
    workbook: Option<Value>,
    source: Option<Arc<dyn ResourceSource>>,
) -> Result<Option<Value>> {
    let target = path.clone();
    let key = Zeroizing::new(password.unwrap_or_default().to_owned());
    let (temporary, result) = entry
        .run(path.clone(), previous, false, move |db| {
            let temporary =
                NamedTempFile::new_in(target.parent().ok_or_else(|| invalid("文件目录无效"))?)?;
            let temporary_path = temporary
                .path()
                .to_str()
                .ok_or_else(|| invalid("临时文件路径编码无效"))?;
            db.execute(
                "ATTACH DATABASE ?1 AS native_key_export KEY ?2",
                params![temporary_path, key.as_str()],
            )?;
            let exported = (|| -> Result<()> {
                db.execute_batch("BEGIN IMMEDIATE")?;
                let copied =
                    db.query_row("SELECT sqlcipher_export('native_key_export')", [], |_| {
                        Ok(())
                    });
                if let Err(error) = copied {
                    db.execute_batch("ROLLBACK")?;
                    return Err(error.into());
                }
                db.pragma_update(
                    Some("native_key_export"),
                    "application_id",
                    schema::APPLICATION_ID,
                )?;
                db.pragma_update(
                    Some("native_key_export"),
                    "user_version",
                    schema::PROTOCOL_VERSION,
                )?;
                db.execute_batch("COMMIT")?;
                Ok(())
            })();
            if exported.is_err() && !db.is_autocommit() {
                db.execute_batch("ROLLBACK")?;
            }
            let detached = db.execute_batch("DETACH DATABASE native_key_export");
            if detached.is_err() {
                // Detach failures must not leave an attached temporary file open
                // while NamedTempFile attempts to delete it on Windows.
                let original = std::mem::replace(db, Connection::open_in_memory()?);
                original.close().map_err(|(_, error)| error)?;
            }
            exported?;
            detached?;
            let mut replacement = Connection::open(temporary.path())?;
            schema::configure(&replacement, Some(key.as_str()))?;
            schema::initialize(&mut replacement, false)?;
            let result = match workbook {
                Some(workbook) => {
                    Some(write::write(&mut replacement, workbook, source.as_deref())?)
                }
                None => None,
            };
            structure::read(&replacement)?;
            let integrity: String =
                replacement.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
            if integrity != "ok" {
                return Err(invalid("密码变更后的数据库校验失败"));
            }
            replacement.close().map_err(|(_, error)| error)?;
            temporary.as_file().sync_all()?;
            Ok((temporary, result))
        })
        .await?;
    entry.close().await?;
    tokio::task::spawn_blocking(move|| {
        temporary.persist(&path).map_err(|error|error.error)?;
        #[cfg(unix)]
        if let Err(error)=std::fs::File::open(path.parent().unwrap()).and_then(|directory|directory.sync_all()) {
            tracing::warn!(error_kind=?error.kind(),"Native replacement committed; directory sync unavailable");
        }
        Ok(result)
    }).await.map_err(|_|super::DocumentError::Worker)?
}
