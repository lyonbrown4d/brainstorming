use super::catalog::Catalog;
use crate::{
  application::Backend, document_fixture as fixture, runtime::documents, transport::ResourceBackend,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::json;

#[tokio::test]
async fn resource_sources_ignore_deleted_documents_on_first_image_lookup() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().join("state"), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
  let png = STANDARD.decode(data).unwrap();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["assets"] = json!({
      "image": {"id":"image","name":"image.png","mimeType":"image/png","data":data}
  });
  workbook["sheets"][0]["document"]["topics"]["root"]["image"] =
    json!({"assetId":"image","width":1,"height":1});
  let path = directory.path().join("valid.brainstorming");
  let saved = state
    .documents
    .write(&path, workbook, None, None, None)
    .await
    .unwrap();
  documents::open(&state, path).await.unwrap();
  let id = saved["sheets"][0]["document"]["assets"]["image"]["storage"]["objectId"]
    .as_str()
    .unwrap();
  let stale_directory = state.directory.join("recovery-sqlite-v2");
  tokio::fs::create_dir_all(&stale_directory).await.unwrap();
  let stale = stale_directory.join("deleted.brainstorming");
  let mut retired = fixture::workbook();
  retired["id"] = json!("retired");
  state
    .documents
    .write(&stale, retired, None, None, None)
    .await
    .unwrap();
  state.documents.release(&stale).await.unwrap();
  tokio::fs::remove_file(&stale).await.unwrap();
  state
    .session
    .lock()
    .await
    .sources
    .insert("retired".into(), stale);

  // The first lookup must succeed in either HashMap order, before any cache hit.
  let catalog = Catalog::new(state.clone());
  let info = catalog.info(id).await.unwrap();
  assert_eq!(info.mime_type, "image/png");
  assert_eq!(info.byte_length, png.len() as u64);
  assert_eq!(catalog.read(id, 0, info.byte_length).await.unwrap(), png);
  assert!(catalog.info(&"0".repeat(64)).await.is_err());
  state.session.lock().await.sources.remove("workbook");
  assert!(catalog.info(id).await.is_err());
  backend.shutdown().await.unwrap();
}
