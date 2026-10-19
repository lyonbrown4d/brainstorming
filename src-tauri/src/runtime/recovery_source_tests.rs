use super::{documents, recovery};
use crate::{application::Backend, document_fixture as fixture};
use serde_json::json;

#[tokio::test]
async fn resource_sources_follow_recovery_replacement_and_clear() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().join("state"), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let mut workbook = fixture::workbook();
  recovery::write(&state, &json!([workbook.to_string()]))
    .await
    .unwrap();
  recovery::read(&state).await.unwrap();
  let first = state.session.lock().await.sources["workbook"].clone();
  workbook["title"] = json!("New recovery generation");
  recovery::write(&state, &json!([workbook.to_string()]))
    .await
    .unwrap();
  let replacement = state.session.lock().await.sources["workbook"].clone();
  assert_ne!(replacement, first);
  assert!(!first.exists());
  assert!(replacement.exists());

  let native = directory.path().join("opened.brainstorming");
  state
    .documents
    .write(&native, workbook, None, None, None)
    .await
    .unwrap();
  let native = tokio::fs::canonicalize(native).await.unwrap();
  documents::open(&state, native.clone()).await.unwrap();
  recovery::write(&state, &json!([])).await.unwrap();
  assert!(!replacement.exists());
  assert_eq!(state.session.lock().await.sources["workbook"], native);
  assert!(state.documents.read(&native, None).await.is_ok());

  let mut retired = fixture::workbook();
  retired["id"] = json!("retired");
  recovery::write(&state, &json!([retired.to_string()]))
    .await
    .unwrap();
  recovery::read(&state).await.unwrap();
  let deleted = state.session.lock().await.sources["retired"].clone();
  recovery::write(&state, &json!([])).await.unwrap();
  assert!(!deleted.exists());
  let session = state.session.lock().await;
  assert!(!session.sources.contains_key("retired"));
  assert_eq!(session.sources["workbook"], native);
  drop(session);
  backend.shutdown().await.unwrap();
}
