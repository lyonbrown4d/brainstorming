use super::{documents, recovery};
use crate::application::Backend;
use crate::document_fixture as fixture;
use serde_json::json;

#[tokio::test]
async fn save_requires_a_native_selected_destination() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().join("state"), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let destination = directory.path().join("unauthorized.brainstorming");
  let request = json!({"contents":fixture::workbook().to_string(),"openDocumentIds":["workbook"]});
  assert!(
    documents::save(&state, destination.clone(), &request)
      .await
      .is_err()
  );
  assert!(!destination.exists());
  state
    .session
    .lock()
    .await
    .authorized
    .insert(destination.clone());
  documents::save(&state, destination.clone(), &request)
    .await
    .unwrap();
  assert_eq!(
    state.documents.read(&destination, None).await.unwrap()["id"],
    "workbook"
  );
  let mut other = fixture::workbook();
  other["id"] = json!("other-workbook");
  other["title"] = json!("Must never replace the first tab");
  let other_request = json!({"contents":other.to_string()});
  let destination = directory.path().join("unauthorized.brainstorming");
  assert!(
    documents::save(&state, destination.clone(), &other_request)
      .await
      .unwrap_err()
      .contains("其他导图标签")
  );
  #[cfg(unix)]
  {
    let alias = directory.path().join("alias.brainstorming");
    std::os::unix::fs::symlink(&destination, &alias).unwrap();
    state.session.lock().await.authorized.insert(alias.clone());
    assert!(
      documents::save(&state, alias, &other_request)
        .await
        .unwrap_err()
        .contains("其他导图标签")
    );
  }
  assert_eq!(
    state.documents.read(&destination, None).await.unwrap(),
    fixture::workbook()
  );
  for ids in [
    json!(null),
    json!([]),
    json!([1]),
    json!(["wrong"]),
    json!(["other-workbook", "other-workbook"]),
    json!((0..33).map(|i| format!("id-{i}")).collect::<Vec<_>>()),
  ] {
    let malformed = json!({"contents":other.to_string(),"openDocumentIds":ids});
    assert!(
      documents::save(&state, destination.clone(), &malformed)
        .await
        .is_err()
    );
  }
  assert_eq!(
    state.documents.read(&destination, None).await.unwrap(),
    fixture::workbook()
  );
  // A page reload may leave native resource handles for the previous renderer,
  // but those handles must not falsely claim ownership of closed tabs.
  let live = json!({"contents":other.to_string(),"openDocumentIds":["other-workbook"]});
  documents::save(&state, destination.clone(), &live)
    .await
    .unwrap();
  assert_eq!(
    state.documents.read(destination, None).await.unwrap(),
    other
  );
  backend.shutdown().await.unwrap();
}

#[tokio::test]
async fn failed_workspace_write_keeps_the_previous_generation() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().to_path_buf(), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let workbook = fixture::workbook();
  recovery::write(&state, &json!([workbook.to_string()]))
    .await
    .unwrap();
  let original = state.metadata.recovery_index().await.unwrap();
  let mut changed = workbook.clone();
  changed["title"] = json!("Uncommitted change");
  let invalid = json!({"id":"invalid","format":"brainstorming","version":2,"sheets":[]});
  assert!(
    recovery::write(&state, &json!([changed.to_string(), invalid.to_string()]))
      .await
      .is_err()
  );
  let retained = state.metadata.recovery_index().await.unwrap();
  assert_eq!(retained[0].file_name, original[0].file_name);
  let opened = recovery::read(&state).await.unwrap();
  let contents: serde_json::Value =
    serde_json::from_str(opened[0]["contents"].as_str().unwrap()).unwrap();
  assert_eq!(contents["title"], workbook["title"]);
  backend.shutdown().await.unwrap();
}

#[tokio::test]
async fn encrypted_recovery_requires_unlock_activation_and_tracks_password_changes() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().to_path_buf(), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let contents = fixture::workbook().to_string();
  state
    .session
    .lock()
    .await
    .set_password("workbook", Some("example-password".into()))
    .unwrap();
  recovery::write(&state, &json!([contents])).await.unwrap();
  state
    .session
    .lock()
    .await
    .set_password("workbook", None)
    .unwrap();
  let opened = recovery::read(&state).await.unwrap();
  let token = opened[0]["lockedToken"].as_str().unwrap();
  assert!(
    documents::unlock(&state, token, "wrong-password")
      .await
      .is_err()
  );
  assert!(recovery::write(&state, &json!([contents])).await.is_err());
  let unlocked = documents::unlock(&state, token, "example-password")
    .await
    .unwrap();
  assert_eq!(unlocked["sessionToken"], token);
  assert!(
    state
      .session
      .lock()
      .await
      .password_for("workbook")
      .is_none()
  );
  documents::activate(&state, token).await.unwrap();
  assert!(
    state
      .session
      .lock()
      .await
      .password_for("workbook")
      .is_some()
  );
  documents::set_password(&state, "workbook", None)
    .await
    .unwrap();
  let entry = state.metadata.recovery_index().await.unwrap().remove(0);
  let path = state
    .directory
    .join("recovery-sqlite-v2")
    .join(entry.file_name);
  assert!(!crate::document::is_encrypted(path).await.unwrap());
  assert!(
    documents::unlock(&state, token, "example-password")
      .await
      .is_err()
  );
  backend.shutdown().await.unwrap();
}

#[tokio::test]
async fn resource_preparation_failure_rolls_back_recovery_password() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().to_path_buf(), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let contents = fixture::workbook().to_string();
  recovery::write(&state, &json!([contents])).await.unwrap();
  let destination = directory.path().join("never-created.brainstorming");
  {
    let mut session = state.session.lock().await;
    session.authorized.insert(destination.clone());
    session.sources.insert(
      "missing-other-document".into(),
      directory.path().join("missing.brainstorming"),
    );
  }
  // A native resource source opens lazily, so an unused missing path is valid.
  // Reference an unavailable object to force actual resource resolution to fail.
  let mut changed = fixture::workbook();
  changed["sheets"][0]["document"]["assets"] = json!({"missing":{"id":"missing","name":"missing.bin","mimeType":"application/octet-stream","storage":{"objectId":"a".repeat(64),"byteLength":7}}});
  changed["sheets"][0]["document"]["topics"]["root"]["attachments"] = json!(["missing"]);
  let request = json!({"contents":changed.to_string(),"password":"new-example-password"});
  assert!(
    documents::save(&state, destination.clone(), &request)
      .await
      .is_err()
  );
  let entry = state.metadata.recovery_index().await.unwrap().remove(0);
  let path = state
    .directory
    .join("recovery-sqlite-v2")
    .join(entry.file_name);
  assert!(!crate::document::is_encrypted(path).await.unwrap());
  assert!(
    state
      .session
      .lock()
      .await
      .password_for("workbook")
      .is_none()
  );
  assert!(tokio::fs::metadata(destination).await.is_err());
  backend.shutdown().await.unwrap();
}

#[tokio::test]
async fn failed_unlock_activation_keeps_credentials_unpublished_and_token_retryable() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().to_path_buf(), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  state
    .session
    .lock()
    .await
    .set_password("workbook", Some("example-password".into()))
    .unwrap();
  recovery::write(&state, &json!([fixture::workbook().to_string()]))
    .await
    .unwrap();
  state
    .session
    .lock()
    .await
    .set_password("workbook", None)
    .unwrap();
  let opened = recovery::read(&state).await.unwrap();
  let token = opened[0]["lockedToken"].as_str().unwrap();
  documents::unlock(&state, token, "example-password")
    .await
    .unwrap();
  let entry = state.metadata.recovery_index().await.unwrap().remove(0);
  let path = state
    .directory
    .join("recovery-sqlite-v2")
    .join(entry.file_name);
  state.documents.release(&path).await.unwrap();
  tokio::fs::remove_file(path).await.unwrap();
  assert!(documents::activate(&state, token).await.is_err());
  let session = state.session.lock().await;
  assert!(session.password_for("workbook").is_none());
  assert!(session.pending.contains_key(token));
  drop(session);
  backend.shutdown().await.unwrap();
}
