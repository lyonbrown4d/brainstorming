#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::document::{DocumentStore, validate_workbook};
use serde_json::json;
use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};

#[tokio::test]
async fn relational_roundtrip_preserves_sheets_order_annotations_and_extensions() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("map # % 图.brainstorming");
  let store = DocumentStore::new();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["topics"]["a"]["style"]["scale"] = json!(1.75);
  workbook["sheets"][0]["document"]["presentation"][0]["appearance"] = json!({
    "background":"#faf8f2", "title":{"scale":1.25,"color":"#234567","align":"center"},
    "body":{"bold":false,"scale":0.9}, "image":{"fit":"cover","position":"right"}
  });
  store
    .write(&path, workbook.clone(), None, None, None)
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  let mut reordered = workbook.clone();
  reordered["sheets"].as_array_mut().unwrap().reverse();
  reordered["sheets"][1]["document"]["topics"]["root"]["children"] = json!(["a", "b"]);
  store
    .write(&path, reordered.clone(), None, None, None)
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), reordered);
  let versions = store.revisions(&path, None).await.unwrap();
  assert_eq!(
    store
      .read_revision(&path, &versions[1].id, None)
      .await
      .unwrap(),
    workbook
  );
  store
    .restore_revision(&path, &versions[1].id, None)
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  store.release(&path).await.unwrap();
}

#[tokio::test]
async fn concurrent_handles_share_canonical_file_and_closing_one_keeps_other_usable() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("same.brainstorming");
  let first = DocumentStore::new();
  let second = first.clone();
  first
    .write(&path, fixture::workbook(), None, None, None)
    .await
    .unwrap();
  first.retain(&path, None).await.unwrap();
  second
    .retain(folder.path().join(".").join("same.brainstorming"), None)
    .await
    .unwrap();
  let (a, b) = tokio::join!(first.read(&path, None), second.read(&path, None));
  assert_eq!(a.unwrap(), b.unwrap());
  first.release(&path).await.unwrap();
  assert_eq!(second.read(&path, None).await.unwrap(), fixture::workbook());
  second.release(&path).await.unwrap();
}

#[tokio::test]
async fn rejected_validation_and_missing_resource_preserve_previous_file() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("valid.brainstorming");
  let store = DocumentStore::new();
  let original = fixture::workbook();
  store
    .write(&path, original.clone(), None, None, None)
    .await
    .unwrap();
  let mut invalid = original.clone();
  invalid["sheets"][0]["document"]["topics"]["root"]["children"] = json!(["a", "a"]);
  assert!(validate_workbook(&invalid).is_err());
  assert!(store.write(&path, invalid, None, None, None).await.is_err());
  let mut missing = original.clone();
  missing["sheets"][0]["document"]["assets"] = json!({"file":{"id":"file","name":"report.txt","mimeType":"text/plain","storage":{"objectId":"a".repeat(64),"byteLength":100}}});
  missing["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["file"]);
  let failed_creation = folder.path().join("failed.brainstorming");
  assert!(
    store
      .write(
        &failed_creation,
        missing.clone(),
        Some("new-file-password"),
        None,
        None
      )
      .await
      .is_err()
  );
  assert!(!failed_creation.exists());
  assert!(store.write(&path, missing, None, None, None).await.is_err());
  assert_eq!(store.read(&path, None).await.unwrap(), original);
  store.release(&path).await.unwrap();
}

#[tokio::test]
async fn native_protocol_is_explicit_and_old_or_unknown_versions_are_rejected() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("old.brainstorming");
  let mut db = SqliteConnection::connect_with(
    &SqliteConnectOptions::new()
      .filename(&path)
      .create_if_missing(true),
  )
  .await
  .unwrap();
  sqlx::raw_sql(
    "PRAGMA application_id=1112690259;PRAGMA user_version=1;CREATE TABLE old_document(id TEXT);",
  )
  .execute(&mut db)
  .await
  .unwrap();
  db.close().await.unwrap();
  let store = DocumentStore::new();
  assert!(
    store
      .read(&path, None)
      .await
      .unwrap_err()
      .to_string()
      .contains("版本")
  );
  assert!(
    store
      .write(&path, fixture::workbook(), None, None, None)
      .await
      .is_err()
  );
}

#[tokio::test]
async fn every_supported_sheet_and_branch_layout_survives_native_reopen() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("layouts.brainstorming");
  let store = DocumentStore::new();
  for layout in [
    "map",
    "logic-right",
    "logic-left",
    "org-down",
    "org-up",
    "tree-down",
    "tree-up",
    "brace-right",
    "brace-left",
    "fishbone",
    "timeline",
    "timeline-vertical",
    "tree-table-right",
    "tree-table-down",
    "matrix",
  ] {
    let mut workbook = fixture::workbook();
    workbook["sheets"][0]["document"]["settings"]["layout"] = json!(layout);
    workbook["sheets"][0]["document"]["topics"]["a"]["structure"] = json!(layout);
    store
      .write(&path, workbook.clone(), None, None, None)
      .await
      .unwrap();
    assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  }
  store.release(&path).await.unwrap();
}
