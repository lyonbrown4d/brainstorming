#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_engine::document::{DocumentSnapshot, DocumentStore};
use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};

#[tokio::test]
async fn read_only_export_rejects_tampered_migration_without_repairing_source() {
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("source.brainstorming");
  let store = DocumentStore::new();
  store
    .write(&path, fixture::workbook(), None, None, None)
    .await
    .unwrap();
  store.shutdown().await.unwrap();
  let mut db = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
    .await
    .unwrap();
  sqlx::query("UPDATE _brainstorming_migrations SET checksum=x'00' WHERE version=1")
    .execute(&mut db)
    .await
    .unwrap();
  db.close().await.unwrap();
  let original = std::fs::read(&path).unwrap();
  let error = DocumentSnapshot::open(&path, None)
    .await
    .err()
    .expect("Corrupt ledger must fail");
  assert!(error.to_string().contains("校验和"));
  assert_eq!(std::fs::read(&path).unwrap(), original);
}
