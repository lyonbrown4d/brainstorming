use super::{Result, error::invalid};
use sqlx::{
  ConnectOptions, Connection, SqliteConnection,
  migrate::{Migrate, Migrator},
  sqlite::SqliteConnectOptions,
};
use std::{path::Path, sync::LazyLock, time::Duration};

pub const APPLICATION_ID: i64 = 0x42524e54;
// File protocol identity; SQLx migration versions evolve independently.
pub const PROTOCOL_VERSION: i64 = 2;
pub(crate) const MIGRATION_TABLE: &str = "_brainstorming_migrations";
static MIGRATOR: LazyLock<Migrator> = LazyLock::new(|| {
  let mut migrator = sqlx::migrate!("./src/document/migrations");
  migrator.dangerous_set_table_name(MIGRATION_TABLE);
  migrator
});

pub(crate) fn options(
  path: &Path,
  password: Option<&str>,
  create: bool,
  read_only: bool,
) -> Result<SqliteConnectOptions> {
  let mut options = SqliteConnectOptions::new()
    .filename(path)
    .create_if_missing(create)
    .read_only(read_only)
    .busy_timeout(Duration::from_secs(10))
    .pragma("trusted_schema", "OFF")
    .pragma("temp_store", "MEMORY")
    .pragma("secure_delete", "ON")
    .synchronous(sqlx::sqlite::SqliteSynchronous::Full)
    .disable_statement_logging();
  if let Some(password) = password.filter(|value| !value.is_empty()) {
    // SQLx explicitly executes key first, ahead of every other pragma.
    // PRAGMA cannot bind parameters; quote the passphrase as a SQL literal.
    options = options.pragma("key", format!("'{}'", password.replace('\'', "''")));
  }
  Ok(options)
}

pub(crate) async fn authenticate(db: &mut SqliteConnection) -> Result<()> {
  let cipher: String = sqlx::query_scalar("PRAGMA cipher_version")
    .fetch_one(&mut *db)
    .await?;
  if cipher.is_empty() {
    return Err(invalid("当前数据库驱动未启用 SQLCipher"));
  }
  {
    let mut handle = db.lock_handle().await?;
    // SAFETY: SQLx locks its worker for this guard; the live handle is used
    // only to set a connection-local limit, never retained or closed here.
    unsafe {
      libsqlite3_sys::sqlite3_limit(
        handle.as_raw_handle().as_ptr(),
        libsqlite3_sys::SQLITE_LIMIT_LENGTH,
        134_217_728,
      );
    }
  }
  let _: i64 = sqlx::query_scalar("SELECT count(*) FROM sqlite_master")
    .fetch_one(&mut *db)
    .await?;
  Ok(())
}

pub(crate) async fn connect(
  path: &Path,
  password: Option<&str>,
  create: bool,
  read_only: bool,
) -> Result<SqliteConnection> {
  let mut db = options(path, password, create, read_only)?
    .connect()
    .await?;
  let result = async {
    authenticate(&mut db).await?;
    initialize(&mut db, create).await
  }
  .await;
  if let Err(error) = result {
    db.close().await?;
    return Err(error);
  }
  Ok(db)
}

pub(crate) async fn initialize(db: &mut SqliteConnection, create: bool) -> Result<()> {
  let application: i64 = sqlx::query_scalar("PRAGMA application_id")
    .fetch_one(&mut *db)
    .await?;
  let version: i64 = sqlx::query_scalar("PRAGMA user_version")
    .fetch_one(&mut *db)
    .await?;
  if application == 0 && version == 0 && create {
    let objects: i64 =
      sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE name NOT GLOB 'sqlite_*'")
        .fetch_one(&mut *db)
        .await?;
    if objects != 0 {
      return Err(invalid("不能覆盖非 Brainstorming 数据库"));
    }
    let mut tx = db.begin_with("BEGIN IMMEDIATE").await?;
    MIGRATOR.run_direct(None, &mut *tx, false).await?;
    stamp_file_identity(&mut tx, false).await?;
    tx.commit().await?;
  } else {
    if application != APPLICATION_ID || version != PROTOCOL_VERSION {
      return Err(invalid("不支持此原生文件版本；原生文件协议为 2"));
    }
    let ledger: i64 =
      sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1")
        .bind(MIGRATION_TABLE)
        .fetch_one(&mut *db)
        .await?;
    if ledger == 0 {
      // Register only the validated current Tauri baseline. Older formats
      // have different identities and never reach this path.
      let mut tx = db.begin_with("BEGIN IMMEDIATE").await?;
      validate_baseline(&mut tx).await?;
      super::structure::read(&mut tx).await?;
      tx.ensure_migrations_table(MIGRATION_TABLE).await?;
      tx.skip(
        MIGRATION_TABLE,
        MIGRATOR
          .iter()
          .next()
          .ok_or_else(|| invalid("缺少初始迁移"))?,
      )
      .await?;
      tx.commit().await?;
    }
    MIGRATOR.run_direct(None, &mut *db, false).await?;
  }
  Ok(())
}

async fn validate_baseline(db: &mut SqliteConnection) -> Result<()> {
  let normalize = |sql: &str| sql.split_whitespace().collect::<Vec<_>>().join(" ");
  let mut expected = include_str!("migrations/001_document.sql")
    .split(';')
    .filter(|sql| !sql.trim().is_empty())
    .map(normalize)
    .collect::<Vec<_>>();
  let actual: Vec<String> = sqlx::query_scalar(
    "SELECT sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' AND sql IS NOT NULL",
  )
  .fetch_all(db)
  .await?;
  let mut actual = actual.iter().map(|sql| normalize(sql)).collect::<Vec<_>>();
  expected.sort();
  actual.sort();
  if expected != actual {
    return Err(invalid("文档数据库基线结构无效"));
  }
  Ok(())
}

pub(crate) async fn stamp_file_identity(db: &mut SqliteConnection, exported: bool) -> Result<()> {
  // Only these application-owned schema names are interpolated, never input.
  let prefix = if exported { "native_key_export." } else { "" };
  sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
    "PRAGMA {prefix}application_id={APPLICATION_ID}; PRAGMA {prefix}user_version={PROTOCOL_VERSION}"
  )))
  .execute(db)
  .await?;
  Ok(())
}
