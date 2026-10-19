#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::document::{DocumentStore, validate_workbook};
use serde_json::json;
use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};

#[tokio::test]
async fn sheet_visual_style_roundtrips_and_invalid_values_never_replace_saved_data() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("sketch.brainstorming");
  let store = DocumentStore::new();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["settings"]["visualStyle"] = json!("sketch");
  workbook["sheets"][1]["document"]["settings"] = json!({"visualStyle":"normal"});
  assert!(validate_workbook(&workbook).is_ok());
  store
    .write(&path, workbook.clone(), None, None, None)
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  for value in [json!("unsupported"), json!(null), json!(true), json!(1)] {
    let mut invalid = workbook.clone();
    invalid["sheets"][0]["document"]["settings"]["visualStyle"] = value;
    assert!(validate_workbook(&invalid).is_err());
    assert!(store.write(&path, invalid, None, None, None).await.is_err());
    assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  }
  store.release(&path).await.unwrap();
  let mut db = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
    .await
    .unwrap();
  sqlx::query("UPDATE sheets SET metadata=json_set(metadata,'$.settings.visualStyle','invalid') WHERE id='sheet-a'")
        .execute(&mut db).await.unwrap();
  db.close().await.unwrap();
  assert!(store.read(&path, None).await.is_err());
  store.release(&path).await.unwrap();
}
