use crate::document::{DocumentError, Result, schema::MIGRATION_TABLE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    Connection, SqliteConnection, SqlitePool,
    migrate::{Migrate, Migrator},
    sqlite::SqliteConnectOptions,
};
use std::{collections::HashSet, path::Path, sync::LazyLock, time::Duration};

static MIGRATOR: LazyLock<Migrator> = LazyLock::new(|| {
    let mut migrator = sqlx::migrate!("./src/storage/migrations");
    // Fixed before the first deployment; never rename an existing database's ledger.
    migrator.dangerous_set_table_name(MIGRATION_TABLE);
    migrator
});

#[derive(Clone)]
pub struct MetadataStore {
    pool: SqlitePool,
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
        let options = SqliteConnectOptions::new()
            .filename(path.as_ref())
            .create_if_missing(true)
            .busy_timeout(Duration::from_secs(10));
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        let initialized = async {
            let mut db = pool.acquire().await?;
            initialize(&mut db).await
        }
        .await;
        if let Err(error) = initialized {
            pool.close().await;
            return Err(error);
        }
        Ok(Self { pool })
    }
    pub async fn shutdown(&self) -> Result<()> {
        self.pool.close().await;
        Ok(())
    }
    pub async fn language(&self) -> Result<Option<String>> {
        let language: Option<String> =
            sqlx::query_scalar("SELECT language FROM preferences WHERE id=1")
                .fetch_optional(&self.pool)
                .await?;
        if language
            .as_deref()
            .is_some_and(|s| s != "en" && s != "zh-CN")
        {
            return Err(invalid("本机语言无效"));
        }
        Ok(language)
    }
    pub async fn set_language(&self, language: &str) -> Result<()> {
        if !["en", "zh-CN"].contains(&language) {
            return Err(invalid("不支持此语言"));
        }
        sqlx::query(
            "INSERT INTO preferences (id,language) VALUES (1,?1) \
             ON CONFLICT(id) DO UPDATE SET language=excluded.language",
        )
        .bind(language)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    pub async fn recent_files(&self) -> Result<Vec<String>> {
        let paths = sqlx::query_scalar("SELECT path FROM recent_files ORDER BY position LIMIT 11")
            .fetch_all(&self.pool)
            .await?;
        validate_paths(&paths)?;
        Ok(paths)
    }
    pub async fn replace_recent_files(&self, paths: Vec<String>) -> Result<()> {
        validate_paths(&paths)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM recent_files")
            .execute(&mut *tx)
            .await?;
        for (position, path) in paths.iter().enumerate() {
            sqlx::query("INSERT INTO recent_files (position,path) VALUES (?1,?2)")
                .bind(position as i64)
                .bind(path)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn recovery_index(&self) -> Result<Vec<RecoveryEntry>> {
        let rows: Vec<(String, String, i64)> = sqlx::query_as(
            "SELECT document_id,file_name,protocol_version FROM workspace_recovery \
             ORDER BY position LIMIT 33",
        )
        .fetch_all(&self.pool)
        .await?;
        let entries = decode_entries(rows)?;
        validate_entries(&entries)?;
        Ok(entries)
    }
    pub async fn replace_recovery_index(&self, entries: Vec<RecoveryEntry>) -> Result<()> {
        validate_entries(&entries)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM workspace_recovery")
            .execute(&mut *tx)
            .await?;
        for (position, entry) in entries.iter().enumerate() {
            sqlx::query(
                "INSERT INTO workspace_recovery \
                 (position,document_id,file_name,protocol_version) VALUES (?1,?2,?3,?4)",
            )
            .bind(position as i64)
            .bind(&entry.document_id)
            .bind(&entry.file_name)
            .bind(i64::from(entry.protocol_version))
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}

async fn initialize(db: &mut SqliteConnection) -> Result<()> {
    // File identity is independent of migration sequence and checked before ledger creation.
    let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&mut *db)
        .await?;
    let app: i64 = sqlx::query_scalar("PRAGMA application_id")
        .fetch_one(&mut *db)
        .await?;
    if version == 0 && app == 0 {
        let objects: i64 =
            sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE name NOT GLOB 'sqlite_*'")
                .fetch_one(&mut *db)
                .await?;
        if objects != 0 {
            return Err(invalid("不能覆盖旧版本本机数据库"));
        }
    } else if version == 1 && app == 1112682061 {
        let ledger: i64 =
            sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1")
                .bind(MIGRATION_TABLE)
                .fetch_one(&mut *db)
                .await?;
        if ledger != 1 {
            register_baseline(db).await?;
        }
    } else {
        return Err(invalid("不支持此本机数据库版本"));
    }
    MIGRATOR.run_direct(None, &mut *db, false).await?;
    Ok(())
}
async fn register_baseline(db: &mut SqliteConnection) -> Result<()> {
    let mut tx = db.begin_with("BEGIN IMMEDIATE").await?;
    let ledger: i64 =
        sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1")
            .bind(MIGRATION_TABLE)
            .fetch_one(&mut *tx)
            .await?;
    if ledger == 0 {
        let definitions: Vec<String> = sqlx::query_scalar(
            "SELECT sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY name",
        )
        .fetch_all(&mut *tx)
        .await?;
        let normalize = |sql: &str| sql.trim().to_owned();
        let mut expected = include_str!("migrations/001_metadata.sql")
            .split(';')
            .map(str::trim)
            .filter(|sql| sql.starts_with("CREATE TABLE"))
            .map(normalize)
            .collect::<Vec<_>>();
        let mut actual = definitions
            .iter()
            .map(|sql| normalize(sql))
            .collect::<Vec<_>>();
        expected.sort();
        actual.sort();
        if expected != actual {
            return Err(invalid("本机数据库结构无效"));
        }
        let languages: Vec<(i64, String)> =
            sqlx::query_as("SELECT id,language FROM preferences LIMIT 2")
                .fetch_all(&mut *tx)
                .await?;
        if languages.len() > 1
            || languages
                .iter()
                .any(|(id, lang)| *id != 1 || !["en", "zh-CN"].contains(&lang.as_str()))
        {
            return Err(invalid("本机语言无效"));
        }
        let paths = sqlx::query_scalar("SELECT path FROM recent_files ORDER BY position LIMIT 11")
            .fetch_all(&mut *tx)
            .await?;
        validate_paths(&paths)?;
        let rows = sqlx::query_as("SELECT document_id,file_name,protocol_version FROM workspace_recovery ORDER BY position LIMIT 33")
            .fetch_all(&mut *tx).await?;
        validate_entries(&decode_entries(rows)?)?;
        tx.ensure_migrations_table(MIGRATION_TABLE).await?;
        let baseline = MIGRATOR
            .iter()
            .find(|migration| migration.version == 1)
            .expect("metadata baseline migration exists");
        tx.skip(MIGRATION_TABLE, baseline).await?;
    }
    tx.commit().await?;
    Ok(())
}

fn decode_entries(rows: Vec<(String, String, i64)>) -> Result<Vec<RecoveryEntry>> {
    rows.into_iter()
        .map(|(document_id, file_name, version)| {
            Ok(RecoveryEntry {
                document_id,
                file_name,
                protocol_version: u32::try_from(version)
                    .map_err(|_| invalid("工作区恢复索引损坏，请保留恢复目录后重试"))?,
            })
        })
        .collect()
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
