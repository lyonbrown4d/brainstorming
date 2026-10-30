#[path = "document_fixture.rs"]
mod fixture;
use base64::{Engine, engine::general_purpose::STANDARD};
use brainstorming_engine::{
  builtin_art,
  document::{CompositeSource, DocumentStore},
};
use serde_json::json;

#[tokio::test]
async fn builtin_art_png_is_carried_by_the_single_document_file() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("art.brainstorming");
  let asset = serde_json::to_value(&*builtin_art::get("camping").await.unwrap()).unwrap();
  let id = asset["id"].as_str().unwrap().to_owned();
  let expected = STANDARD.decode(asset["data"].as_str().unwrap()).unwrap();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["assets"] = json!({id.clone(): asset});
  workbook["sheets"][0]["document"]["topics"]["a"]["image"] =
    json!({"assetId":id,"width":512,"height":512});
  let store = DocumentStore::new();
  // Native saves always provide a composite source, even for embedded bytes.
  let source = std::sync::Arc::new(CompositeSource::new(Vec::new()));
  let saved = store
    .write(&path, workbook, None, None, Some(source))
    .await
    .unwrap();
  let object_id = saved["sheets"][0]["document"]["assets"][&id]["storage"]["objectId"]
    .as_str()
    .unwrap();
  assert!(
    saved["sheets"][0]["document"]["assets"][&id]
      .get("data")
      .is_none()
  );
  store.release(&path).await.unwrap();
  // A fresh store reads the exact bytes without a source asset path or render cache.
  let reopened = DocumentStore::new();
  assert_eq!(
    reopened
      .read_resource(&path, object_id, 0, Some(expected.len() as u64), None)
      .await
      .unwrap(),
    expected
  );
  reopened.release(&path).await.unwrap();
}
