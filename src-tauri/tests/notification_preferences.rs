use brainstorming_native::storage::MetadataStore;
use sqlx::{Connection, SqliteConnection};

#[tokio::test]
async fn notification_migration_preserves_existing_language_and_defaults_to_disabled() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("metadata.sqlite");
  let mut db = SqliteConnection::connect(&format!("sqlite://{}?mode=rwc", path.display()))
    .await
    .unwrap();
  sqlx::raw_sql(include_str!("../src/storage/migrations/001_metadata.sql"))
    .execute(&mut db)
    .await
    .unwrap();
  sqlx::query("INSERT INTO preferences (id,language) VALUES (1,'en')")
    .execute(&mut db)
    .await
    .unwrap();
  db.close().await.unwrap();
  let store = MetadataStore::new(&path).await.unwrap();
  assert_eq!(store.language().await.unwrap().as_deref(), Some("en"));
  assert!(!store.notifications_enabled().await.unwrap());
  store.set_notifications_enabled(true).await.unwrap();
  store.shutdown().await.unwrap();
  let reopened = MetadataStore::new(&path).await.unwrap();
  assert!(reopened.notifications_enabled().await.unwrap());
  assert_eq!(reopened.language().await.unwrap().as_deref(), Some("en"));
  reopened.set_notifications_enabled(false).await.unwrap();
  assert!(!reopened.notifications_enabled().await.unwrap());
  reopened.shutdown().await.unwrap();
}

#[tokio::test]
async fn existing_migration_ledger_applies_only_the_new_notification_migration() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("metadata.sqlite");
  let store = MetadataStore::new(&path).await.unwrap();
  store.set_language("zh-CN").await.unwrap();
  store.shutdown().await.unwrap();
  let mut db = SqliteConnection::connect(&format!("sqlite://{}", path.display()))
    .await
    .unwrap();
  // Recreate the deployed baseline with its original, unchanged checksum.
  sqlx::raw_sql(
    "DROP TABLE notification_preferences; DELETE FROM _brainstorming_migrations WHERE version=2",
  )
  .execute(&mut db)
  .await
  .unwrap();
  db.close().await.unwrap();
  let upgraded = MetadataStore::new(&path).await.unwrap();
  assert!(!upgraded.notifications_enabled().await.unwrap());
  assert_eq!(upgraded.language().await.unwrap().as_deref(), Some("zh-CN"));
  upgraded.shutdown().await.unwrap();
}
