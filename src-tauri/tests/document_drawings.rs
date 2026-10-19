#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::document::{DocumentStore, validate_workbook};
use serde_json::json;
use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};

#[tokio::test]
async fn drawings_roundtrip_as_ordered_annotations_and_invalid_changes_preserve_file() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("drawing.brainstorming");
    let store = DocumentStore::new();
    let mut workbook = fixture::workbook();
    let stroke = json!({"id":"ink-a","color":"#123abc","width":4,"points":[{"x":-200,"y":50,"pressure":0.5},{"x":500,"y":100,"pressure":1}]});
    workbook["sheets"][0]["document"]["drawings"] = json!([stroke]);
    workbook["sheets"][1]["document"]["drawings"] = json!([]);
    assert!(validate_workbook(&workbook).is_ok());
    store
        .write(&path, workbook.clone(), None, None, None)
        .await
        .unwrap();
    assert_eq!(store.read(&path, None).await.unwrap(), workbook);
    let mut invalid = workbook.clone();
    invalid["sheets"][0]["document"]["drawings"][0]["points"][0]["pressure"] = json!(2);
    assert!(store.write(&path, invalid, None, None, None).await.is_err());
    assert_eq!(store.read(&path, None).await.unwrap(), workbook);
    store.release(&path).await.unwrap();
}

#[tokio::test]
async fn old_optional_array_metadata_without_drawings_still_opens() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("before-drawings.brainstorming");
    let store = DocumentStore::new();
    let workbook = fixture::workbook();
    store
        .write(&path, workbook.clone(), None, None, None)
        .await
        .unwrap();
    store.release(&path).await.unwrap();
    let mut db = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
        .await
        .unwrap();
    sqlx::query("UPDATE sheets SET metadata=json_remove(metadata,'$.arrays.drawings')")
        .execute(&mut db)
        .await
        .unwrap();
    db.close().await.unwrap();
    assert_eq!(store.read(&path, None).await.unwrap(), workbook);
    store.release(&path).await.unwrap();
}
