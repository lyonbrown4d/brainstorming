#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_engine::document::{DocumentError, DocumentStore};
use sqlx::{
  ConnectOptions, Connection, SqliteConnection, migrate::MigrateError, sqlite::SqliteConnectOptions,
};
use std::path::Path;

async fn connect(path: &Path, password: Option<&str>) -> SqliteConnection {
  let mut options = SqliteConnectOptions::new()
    .filename(path)
    .disable_statement_logging();
  if let Some(password) = password {
    options = options.pragma("key", format!("'{}'", password.replace('\'', "''")));
  }
  options.connect().await.unwrap()
}

async fn history(db: &mut SqliteConnection) -> Vec<(i64, Vec<u8>)> {
  sqlx::query_as("SELECT version,checksum FROM _brainstorming_migrations ORDER BY version")
    .fetch_all(db)
    .await
    .unwrap()
}

#[tokio::test]
async fn document_ledger_survives_encrypted_plaintext_and_encrypted_exports() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("protected.brainstorming");
  let store = DocumentStore::new();
  let workbook = fixture::workbook();
  let first_password = "first-'密钥";
  store
    .write(&path, workbook.clone(), Some(first_password), None, None)
    .await
    .unwrap();
  store.release(&path).await.unwrap();
  let mut db = connect(&path, Some(first_password)).await;
  assert_eq!(
    sqlx::query_scalar::<_, i64>("SELECT sqlite_compileoption_used('MAX_LENGTH=134217728')")
      .fetch_one(&mut db)
      .await
      .unwrap(),
    1,
    "the length bound applies before any connection pragma reads a schema"
  );
  let initial = history(&mut db).await;
  assert_eq!(initial.len(), 2);
  assert_eq!(initial[1].0, 2);
  assert_eq!(initial[0].0, 1);
  assert!(!initial[0].1.is_empty());
  assert_eq!(
    sqlx::query_scalar::<_, i64>("PRAGMA user_version")
      .fetch_one(&mut db)
      .await
      .unwrap(),
    2
  );
  assert_eq!(
    sqlx::query_scalar::<_, i64>(
      "SELECT count(*) FROM sqlite_master WHERE name='_sqlx_migrations'"
    )
    .fetch_one(&mut db)
    .await
    .unwrap(),
    0
  );
  db.close().await.unwrap();

  for (previous, password) in [(Some(first_password), None), (None, Some("second-'密钥"))] {
    store.rekey(&path, previous, password).await.unwrap();
    assert_eq!(store.read(&path, password).await.unwrap(), workbook);
    store.release(&path).await.unwrap();
    let mut db = connect(&path, password).await;
    assert_eq!(history(&mut db).await, initial);
    assert_eq!(
      sqlx::query_scalar::<_, i64>("PRAGMA user_version")
        .fetch_one(&mut db)
        .await
        .unwrap(),
      2
    );
    db.close().await.unwrap();
  }
}

#[tokio::test]
async fn document_read_rejects_modified_checksums_and_unknown_migrations() {
  let folder = tempfile::tempdir().unwrap();
  let store = DocumentStore::new();
  for (name, mutation) in [
    (
      "checksum",
      "UPDATE _brainstorming_migrations SET checksum=zeroblob(48) WHERE version=1",
    ),
    (
      "unknown",
      "INSERT INTO _brainstorming_migrations (version,description,success,checksum,execution_time) SELECT 99,description,success,checksum,execution_time FROM _brainstorming_migrations WHERE version=1",
    ),
  ] {
    let path = folder.path().join(format!("{name}.brainstorming"));
    let workbook = fixture::workbook();
    store
      .write(&path, workbook.clone(), None, None, None)
      .await
      .unwrap();
    store.release(&path).await.unwrap();
    let mut db = connect(&path, None).await;
    sqlx::query(mutation).execute(&mut db).await.unwrap();
    let changed_history = history(&mut db).await;
    let error = store.read(&path, None).await.unwrap_err();
    match name {
      "checksum" => assert!(matches!(
        error,
        DocumentError::Migration(MigrateError::VersionMismatch(1))
      )),
      "unknown" => assert!(matches!(
        error,
        DocumentError::Migration(MigrateError::VersionMissing(99))
      )),
      _ => unreachable!(),
    }
    assert_eq!(history(&mut db).await, changed_history);
    assert_eq!(
      sqlx::query_scalar::<_, String>("SELECT title FROM document")
        .fetch_one(&mut db)
        .await
        .unwrap(),
      workbook["title"].as_str().unwrap()
    );
    store.release(&path).await.unwrap();
    db.close().await.unwrap();
  }
}

#[tokio::test]
async fn document_current_baseline_registration_preserves_data_and_records_baseline_once() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("current.brainstorming");
  let store = DocumentStore::new();
  let workbook = fixture::workbook();
  store
    .write(&path, workbook.clone(), Some("baseline-'密钥"), None, None)
    .await
    .unwrap();
  store.release(&path).await.unwrap();
  let mut db = connect(&path, Some("baseline-'密钥")).await;
  let initial = history(&mut db).await;
  sqlx::raw_sql("DROP TABLE document_previews; DROP TABLE document_preview_state; DROP TABLE _brainstorming_migrations")
        .execute(&mut db)
        .await
        .unwrap();
  db.close().await.unwrap();

  assert_eq!(
    store.read(&path, Some("baseline-'密钥")).await.unwrap(),
    workbook
  );
  store.release(&path).await.unwrap();
  assert_eq!(
    store.read(&path, Some("baseline-'密钥")).await.unwrap(),
    workbook
  );
  store.release(&path).await.unwrap();
  let mut db = connect(&path, Some("baseline-'密钥")).await;
  assert_eq!(history(&mut db).await, initial);
  assert_eq!(
    sqlx::query_scalar::<_, i64>(
      "SELECT execution_time FROM _brainstorming_migrations WHERE version=1"
    )
    .fetch_one(&mut db)
    .await
    .unwrap(),
    -1
  );
  assert_eq!(
    sqlx::query_scalar::<_, i64>("PRAGMA user_version")
      .fetch_one(&mut db)
      .await
      .unwrap(),
    2
  );
  db.close().await.unwrap();
}

#[tokio::test]
async fn document_invalid_current_baseline_is_rejected_without_creating_a_ledger() {
  let folder = tempfile::tempdir().unwrap();
  let store = DocumentStore::new();
  for (name, mutation) in [
    ("schema", "DROP INDEX topics_parent"),
    ("data", "UPDATE sheets SET root_id='missing-root'"),
  ] {
    let path = folder.path().join(format!("invalid-{name}.brainstorming"));
    store
      .write(&path, fixture::workbook(), None, None, None)
      .await
      .unwrap();
    store.release(&path).await.unwrap();
    let mut db = connect(&path, None).await;
    sqlx::raw_sql("DROP TABLE document_previews; DROP TABLE document_preview_state; DROP TABLE _brainstorming_migrations")
            .execute(&mut db)
            .await
            .unwrap();
    sqlx::query(mutation).execute(&mut db).await.unwrap();
    assert!(store.read(&path, None).await.is_err(), "{name}");
    assert_eq!(
      sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM sqlite_master WHERE name='_brainstorming_migrations'"
      )
      .fetch_one(&mut db)
      .await
      .unwrap(),
      0,
      "{name}"
    );
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sheets")
        .fetch_one(&mut db)
        .await
        .unwrap(),
      fixture::workbook()["sheets"].as_array().unwrap().len() as i64
    );
    store.release(&path).await.unwrap();
    db.close().await.unwrap();
  }
}
