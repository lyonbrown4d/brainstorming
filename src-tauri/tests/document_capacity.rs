#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::{document::DocumentStore, storage::ResourceVault};
use serde_json::json;
use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};
use std::sync::Arc;

#[tokio::test]
async fn aggregate_and_entry_counts_are_independent_of_legacy_zip_limits() {
  let folder = tempfile::tempdir().unwrap();
  let vault = Arc::new(ResourceVault::new(folder.path()).await.unwrap());
  let bytes = vec![0; 7 * 1024 * 1024];
  let object = vault.import_bytes(bytes.clone()).await.unwrap();
  let mut workbook = fixture::workbook();
  let asset = json!({"id":"large","name":"large.bin","mimeType":"application/octet-stream","storage":{"objectId":object.object_id,"byteLength":object.byte_length}});
  for sheet in workbook["sheets"].as_array_mut().unwrap() {
    sheet["document"]["assets"] = json!({"large":asset.clone()});
    sheet["document"]["topics"]["root"]["attachments"] = json!(["large"]);
  }
  let store = DocumentStore::new();
  let path = folder.path().join("capacity.brainstorming");
  let saved = store
    .write(&path, workbook, None, None, Some(vault))
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), saved);
  assert_eq!(
    store
      .read_resource(&path, &object.object_id, 0, Some(bytes.len() as u64), None)
      .await
      .unwrap(),
    bytes
  );
  store.release(&path).await.unwrap();
  let mut db = SqliteConnection::connect_with(
    &SqliteConnectOptions::new()
      .filename(&path)
      .create_if_missing(true),
  )
  .await
  .unwrap();
  assert_eq!(
    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM resource_objects")
      .fetch_one(&mut db)
      .await
      .unwrap(),
    1
  );
  db.close().await.unwrap();

  let mut workbook = fixture::workbook();
  let document = &mut workbook["sheets"][0]["document"];
  document["assets"] = json!({});
  let mut children = vec![json!("b"), json!("a")];
  for i in 0..16 {
    let topic_id = format!("topic-{i}");
    children.push(json!(topic_id));
    let mut attachments = Vec::new();
    for j in 0..32 {
      let id = format!("asset-{i}-{j}");
      document["assets"][&id] =
        json!({"id":id,"name":"empty.bin","mimeType":"application/octet-stream","data":""});
      attachments.push(id);
    }
    document["topics"][&topic_id] = json!({"id":topic_id,"title":"Many","side":"right","collapsed":false,"children":[],"attachments":attachments});
  }
  document["topics"]["root"]["children"] = json!(children);
  let many = folder.path().join("many.brainstorming");
  let saved = store
    .write(&many, workbook, None, None, None)
    .await
    .unwrap();
  assert_eq!(store.read(&many, None).await.unwrap(), saved);
  assert_eq!(
    saved["sheets"][0]["document"]["assets"]
      .as_object()
      .unwrap()
      .len(),
    512
  );
  store.release(&many).await.unwrap();
}

#[tokio::test]
async fn oversized_corrupt_chunk_is_bounded_before_serving_one_byte() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("oversized.brainstorming");
  let store = DocumentStore::new();
  store
    .write(&path, fixture::workbook(), None, None, None)
    .await
    .unwrap();
  let object = store
    .import_resource(&path, b"safe".to_vec(), None)
    .await
    .unwrap();
  store.release(&path).await.unwrap();
  let mut db = SqliteConnection::connect_with(
    &SqliteConnectOptions::new()
      .filename(&path)
      .create_if_missing(true),
  )
  .await
  .unwrap();
  sqlx::query("PRAGMA ignore_check_constraints=ON")
    .execute(&mut db)
    .await
    .unwrap();
  sqlx::query("UPDATE resource_chunks SET data=zeroblob(1048576) WHERE object_id=?1")
    .bind(&object.object_id)
    .execute(&mut db)
    .await
    .unwrap();
  db.close().await.unwrap();
  assert!(
    store
      .read_resource(&path, &object.object_id, 0, Some(1), None)
      .await
      .is_err()
  );
  store.release(&path).await.unwrap();
}
