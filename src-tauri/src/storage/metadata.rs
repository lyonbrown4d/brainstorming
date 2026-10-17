use crate::document::{DocumentError, Result};
use deadpool_sqlite::{Config, Pool, Runtime};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, path::Path};

#[derive(Clone)]
pub struct MetadataStore {
    pool: Pool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryEntry {
    pub document_id: String,
    pub file_name: String,
    pub protocol_version: u32,
}
fn invalid(message: &str) -> DocumentError {
    DocumentError::Invalid(message.to_owned())
}

impl MetadataStore {
    pub async fn new(path: impl AsRef<Path>) -> Result<Self> {
        if let Some(parent) = path.as_ref().parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let config = Config::new(path.as_ref());
        let manager = deadpool_sqlite::Manager::from_config(&config, Runtime::Tokio1);
        let pool = Pool::builder(manager)
            .max_size(1)
            .build()
            .map_err(|_| DocumentError::Pool)?;
        let store = Self { pool };
        store
            .run(|db| {
                db.busy_timeout(std::time::Duration::from_secs(10))?;
                let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
                let app: i64 = db.pragma_query_value(None, "application_id", |r| r.get(0))?;
                if version == 0 && app == 0 {
                    let tables: i64 = db.query_row(
                        "SELECT count(*) FROM sqlite_master WHERE type='table'",
                        [],
                        |r| r.get(0),
                    )?;
                    if tables != 0 {
                        return Err(invalid("不能覆盖旧版本本机数据库"));
                    }
                    let tx = db.transaction()?;
                    tx.execute_batch(include_str!("migrations/001_metadata.sql"))?;
                    tx.commit()?;
                } else if version != 1 || app != 1112682061 {
                    return Err(invalid("不支持此本机数据库版本"));
                }
                Ok(())
            })
            .await?;
        Ok(store)
    }
    async fn run<T, F>(&self, operation: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut rusqlite::Connection) -> Result<T> + Send + 'static,
    {
        let db = self.pool.get().await.map_err(|_| DocumentError::Pool)?;
        db.interact(operation)
            .await
            .map_err(|_| DocumentError::Worker)?
    }
    pub async fn shutdown(&self) -> Result<()> {
        if self.pool.is_closed() {
            return Ok(());
        }
        let connection = match self.pool.get().await {
            Ok(connection) => connection,
            Err(_) if self.pool.is_closed() => return Ok(()),
            Err(_) => return Err(DocumentError::Pool),
        };
        self.pool.close();
        connection
            .interact(|db| {
                let placeholder = rusqlite::Connection::open_in_memory()?;
                let original = std::mem::replace(db, placeholder);
                original.close().map_err(|(_, error)| error)?;
                Ok(())
            })
            .await
            .map_err(|_| DocumentError::Worker)?
    }
    pub async fn language(&self) -> Result<Option<String>> {
        self.run(|db| {
            let language: Option<String> = db
                .query_row("SELECT language FROM preferences WHERE id=1", [], |r| {
                    r.get(0)
                })
                .optional()?;
            if language
                .as_deref()
                .is_some_and(|s| s != "en" && s != "zh-CN")
            {
                return Err(invalid("本机语言无效"));
            }
            Ok(language)
        })
        .await
    }
    pub async fn set_language(&self, language: &str) -> Result<()> {
        if !["en", "zh-CN"].contains(&language) {
            return Err(invalid("不支持此语言"));
        }
        let language = language.to_owned();
        self.run(move|db|{db.execute("INSERT INTO preferences VALUES (1,?1) ON CONFLICT(id) DO UPDATE SET language=excluded.language",[language])?;Ok(())}).await
    }
    pub async fn recent_files(&self) -> Result<Vec<String>> {
        self.run(|db| {
            let mut query =
                db.prepare("SELECT path FROM recent_files ORDER BY position LIMIT 11")?;
            let paths = query
                .query_map([], |r| r.get(0))?
                .collect::<std::result::Result<Vec<String>, _>>()?;
            validate_paths(&paths)?;
            Ok(paths)
        })
        .await
    }
    pub async fn replace_recent_files(&self, paths: Vec<String>) -> Result<()> {
        validate_paths(&paths)?;
        self.run(move |db| {
            let tx = db.transaction()?;
            tx.execute("DELETE FROM recent_files", [])?;
            for (position, path) in paths.iter().enumerate() {
                tx.execute(
                    "INSERT INTO recent_files VALUES (?1,?2)",
                    params![position as i64, path],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
    }
    pub async fn recovery_index(&self) -> Result<Vec<RecoveryEntry>> {
        self.run(|db|{
            let mut query=db.prepare("SELECT document_id,file_name,protocol_version FROM workspace_recovery ORDER BY position LIMIT 33")?;
            let entries=query.query_map([],|r|Ok(RecoveryEntry{document_id:r.get(0)?,file_name:r.get(1)?,protocol_version:r.get(2)?}))?.collect::<std::result::Result<Vec<_>,_>>()?;
            validate_entries(&entries)?;
            Ok(entries)
        }).await
    }
    pub async fn replace_recovery_index(&self, entries: Vec<RecoveryEntry>) -> Result<()> {
        self.run(move |db| {
            validate_entries(&entries)?;
            let tx = db.transaction()?;
            tx.execute("DELETE FROM workspace_recovery", [])?;
            for (position, entry) in entries.iter().enumerate() {
                tx.execute(
                    "INSERT INTO workspace_recovery VALUES (?1,?2,?3,?4)",
                    params![
                        position as i64,
                        entry.document_id,
                        entry.file_name,
                        entry.protocol_version
                    ],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
    }
}
fn validate_paths(paths: &[String]) -> Result<()> {
    let mut unique = HashSet::new();
    if paths.len() > 10 {
        return Err(invalid("最近文件数量超过限制"));
    }
    for path in paths {
        if path.is_empty() || path.len() > 32768 || path.contains('\0') || !unique.insert(path) {
            return Err(invalid("最近文件路径无效"));
        }
    }
    Ok(())
}
fn validate_entries(entries: &[RecoveryEntry]) -> Result<()> {
    if entries.len() > 32 {
        return Err(invalid("工作区最多恢复 32 个文档"));
    }
    let mut unique = HashSet::new();
    for entry in entries {
        let stem = hex::encode(Sha256::digest(entry.document_id.as_bytes()));
        let rest = entry
            .file_name
            .strip_prefix(&format!("{stem}."))
            .and_then(|s| s.strip_suffix(".brainstorming"));
        if entry.document_id.trim().is_empty()
            || entry.document_id.len() > 4096
            || !unique.insert(&entry.document_id)
            || entry.protocol_version != 3
            || rest.is_none_or(|s| uuid::Uuid::parse_str(s).is_err() || s.len() != 36)
        {
            return Err(invalid("工作区恢复索引损坏，请保留恢复目录后重试"));
        }
    }
    Ok(())
}
