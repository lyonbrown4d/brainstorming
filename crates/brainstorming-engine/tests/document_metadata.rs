use brainstorming_engine::storage::{MetadataStore, RecoveryEntry};
use sha2::{Digest, Sha256};
use sqlx::{ConnectOptions, Connection, SqliteConnection, sqlite::SqliteConnectOptions};

async fn open_db(path: &std::path::Path) -> SqliteConnection {
  SqliteConnectOptions::new()
    .filename(path)
    .create_if_missing(true)
    .connect()
    .await
    .unwrap()
}
async fn count(db: &mut SqliteConnection, sql: &'static str) -> i64 {
  sqlx::query_scalar(sql).fetch_one(db).await.unwrap()
}

#[tokio::test]
async fn metadata_prefs_recent_files_and_recovery_index_persist_and_validate_atomically() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("metadata.sqlite");
  let store = MetadataStore::new(&path).await.unwrap();
  store.set_language("zh-CN").await.unwrap();
  store
    .replace_recent_files(vec![
      "/maps/a.brainstorming".into(),
      "/maps/b.brainstorming".into(),
    ])
    .await
    .unwrap();
  let entry = RecoveryEntry {
    document_id: "test-document".into(),
    file_name: format!(
      "{}.{}.brainstorming",
      hex::encode(Sha256::digest(b"test-document")),
      uuid::Uuid::new_v4()
    ),
    protocol_version: 3,
  };
  store
    .replace_recovery_index(vec![entry.clone()])
    .await
    .unwrap();
  assert!(
    store
      .replace_recent_files(vec!["duplicate".into(), "duplicate".into()])
      .await
      .is_err()
  );
  assert!(
    store
      .replace_recovery_index(vec![RecoveryEntry {
        file_name: "../outside.brainstorming".into(),
        ..entry.clone()
      }])
      .await
      .is_err()
  );
  let reopened = MetadataStore::new(&path).await.unwrap();
  assert_eq!(reopened.language().await.unwrap(), Some("zh-CN".into()));
  assert_eq!(
    reopened.recent_files().await.unwrap(),
    vec!["/maps/a.brainstorming", "/maps/b.brainstorming"]
  );
  assert_eq!(
    reopened.recovery_index().await.unwrap()[0].file_name,
    entry.file_name
  );
  store.shutdown().await.unwrap();
  reopened.shutdown().await.unwrap();
}

#[tokio::test]
async fn metadata_migrations_use_custom_ledger_and_reject_changed_history() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("metadata.sqlite");
  let store = MetadataStore::new(&path).await.unwrap();
  store.set_language("zh-CN").await.unwrap();
  store.shutdown().await.unwrap();
  store.shutdown().await.unwrap();
  assert!(store.language().await.is_err());
  let mut db = open_db(&path).await;
  assert_eq!(
    count(
      &mut db,
      "SELECT count(*) FROM _brainstorming_migrations WHERE version=1 AND success=1"
    )
    .await,
    1
  );
  assert_eq!(
    count(
      &mut db,
      "SELECT count(*) FROM sqlite_master WHERE name='_sqlx_migrations'"
    )
    .await,
    0
  );
  sqlx::query("UPDATE _brainstorming_migrations SET checksum=zeroblob(48) WHERE version=1")
    .execute(&mut db)
    .await
    .unwrap();
  assert!(MetadataStore::new(&path).await.is_err());
  assert_eq!(
    sqlx::query_scalar::<_, String>("SELECT language FROM preferences WHERE id=1")
      .fetch_one(&mut db)
      .await
      .unwrap(),
    "zh-CN"
  );
  db.close().await.unwrap();
}

#[tokio::test]
async fn metadata_rejects_unrecognized_files_before_creating_a_ledger() {
  let folder = tempfile::tempdir().unwrap();
  for (name, setup) in [
    ("foreign", "CREATE VIEW foreign_view AS SELECT 1"),
    ("sqlite_prefix", "CREATE TABLE sqliteXforeign (value TEXT)"),
    (
      "newer",
      "PRAGMA application_id=1112682061; PRAGMA user_version=2",
    ),
    (
      "other_app",
      "PRAGMA application_id=123; PRAGMA user_version=1",
    ),
    (
      "malformed_current",
      "PRAGMA application_id=1112682061; PRAGMA user_version=1",
    ),
  ] {
    let path = folder.path().join(format!("{name}.sqlite"));
    let mut db = open_db(&path).await;
    sqlx::raw_sql(setup).execute(&mut db).await.unwrap();
    assert!(MetadataStore::new(&path).await.is_err(), "{name}");
    assert_eq!(
      count(
        &mut db,
        "SELECT count(*) FROM sqlite_master WHERE name='_brainstorming_migrations'"
      )
      .await,
      0,
      "{name}"
    );
    if name == "foreign" {
      assert_eq!(count(&mut db, "SELECT * FROM foreign_view").await, 1);
    }
    db.close().await.unwrap();
  }
}

#[tokio::test]
async fn metadata_rejects_unknown_or_incomplete_migrations_without_changing_preferences() {
  let folder = tempfile::tempdir().unwrap();
  for (name, mutation) in [
    (
      "unknown",
      "UPDATE _brainstorming_migrations SET version=99 WHERE version=1",
    ),
    (
      "incomplete",
      "UPDATE _brainstorming_migrations SET success=0 WHERE version=1",
    ),
  ] {
    let path = folder.path().join(format!("{name}.sqlite"));
    let store = MetadataStore::new(&path).await.unwrap();
    store.set_language("en").await.unwrap();
    store.shutdown().await.unwrap();
    let mut db = open_db(&path).await;
    sqlx::raw_sql(mutation).execute(&mut db).await.unwrap();
    assert!(MetadataStore::new(&path).await.is_err(), "{name}");
    assert_eq!(
      sqlx::query_scalar::<_, String>("SELECT language FROM preferences WHERE id=1")
        .fetch_one(&mut db)
        .await
        .unwrap(),
      "en"
    );
    db.close().await.unwrap();
  }
}

#[tokio::test]
async fn metadata_recent_replacement_rolls_back_when_an_insert_fails() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("metadata.sqlite");
  let store = MetadataStore::new(&path).await.unwrap();
  store
    .replace_recent_files(vec!["original".into()])
    .await
    .unwrap();
  let mut db = open_db(&path).await;
  sqlx::raw_sql(
    "CREATE TRIGGER reject_recent BEFORE INSERT ON recent_files \
         WHEN NEW.path='rejected' BEGIN SELECT RAISE(ABORT,'test failure'); END;",
  )
  .execute(&mut db)
  .await
  .unwrap();
  assert!(
    store
      .replace_recent_files(vec!["accepted".into(), "rejected".into()])
      .await
      .is_err()
  );
  assert_eq!(store.recent_files().await.unwrap(), vec!["original"]);
  store.shutdown().await.unwrap();
  db.close().await.unwrap();
}

#[tokio::test]
async fn metadata_current_baseline_registration_preserves_preferences_recent_and_recovery() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("metadata.sqlite");
  let store = MetadataStore::new(&path).await.unwrap();
  store.set_language("zh-CN").await.unwrap();
  store
    .replace_recent_files(vec!["/maps/current.brainstorming".into()])
    .await
    .unwrap();
  let entry = RecoveryEntry {
    document_id: "current-document".into(),
    file_name: format!(
      "{}.{}.brainstorming",
      hex::encode(Sha256::digest(b"current-document")),
      uuid::Uuid::new_v4()
    ),
    protocol_version: 3,
  };
  store
    .replace_recovery_index(vec![entry.clone()])
    .await
    .unwrap();
  store.shutdown().await.unwrap();
  let mut db = open_db(&path).await;
  sqlx::raw_sql("DROP TABLE notification_preferences; DROP TABLE _brainstorming_migrations")
    .execute(&mut db)
    .await
    .unwrap();
  let reopened = MetadataStore::new(&path).await.unwrap();
  assert_eq!(reopened.language().await.unwrap().as_deref(), Some("zh-CN"));
  assert_eq!(
    reopened.recent_files().await.unwrap(),
    vec!["/maps/current.brainstorming"]
  );
  assert_eq!(
    reopened.recovery_index().await.unwrap()[0].file_name,
    entry.file_name
  );
  assert_eq!(
    count(
      &mut db,
      "SELECT count(*) FROM _brainstorming_migrations WHERE version=1 AND success=1"
    )
    .await,
    1
  );
  reopened.shutdown().await.unwrap();
  db.close().await.unwrap();
}

#[tokio::test]
async fn metadata_current_baseline_validation_rejects_corrupt_data_without_ledger() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("metadata.sqlite");
  let store = MetadataStore::new(&path).await.unwrap();
  store
    .replace_recent_files(vec!["original".into()])
    .await
    .unwrap();
  store.shutdown().await.unwrap();
  let mut db = open_db(&path).await;
  sqlx::raw_sql("DROP TABLE notification_preferences; DROP TABLE _brainstorming_migrations; INSERT INTO recent_files VALUES (1,'')")
        .execute(&mut db)
        .await
        .unwrap();
  assert!(MetadataStore::new(&path).await.is_err());
  assert_eq!(
    count(
      &mut db,
      "SELECT count(*) FROM sqlite_master WHERE name='_brainstorming_migrations'"
    )
    .await,
    0
  );
  assert_eq!(count(&mut db, "SELECT count(*) FROM recent_files").await, 2);
  db.close().await.unwrap();
}
