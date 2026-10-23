use super::{documents, recovery, windows::Transfer};
use crate::{application::Backend, document_fixture as fixture};
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn windows_share_process_services_but_isolate_grants_keys_and_search() {
  let folder = tempfile::tempdir().unwrap();
  let backend = Backend::start(folder.path().into(), None).await.unwrap();
  let root = &backend.state;
  root
    .windows
    .register("editor-second", Vec::new())
    .await
    .unwrap();
  let first = root.for_window("main").await.unwrap();
  let second = root.for_window("editor-second").await.unwrap();
  assert!(root.for_window("remote-preview").await.is_err());
  assert!(Arc::ptr_eq(&first.documents, &second.documents));
  assert!(Arc::ptr_eq(&first.compute, &second.compute));
  assert!(Arc::ptr_eq(&first.editor, &second.editor));
  assert!(Arc::ptr_eq(&first.vault, &second.vault));
  assert!(!Arc::ptr_eq(&first.session, &second.session));
  assert!(!Arc::ptr_eq(&first.search, &second.search));
  first
    .session
    .lock()
    .await
    .authorized
    .insert(folder.path().join("private.brainstorming"));
  first
    .session
    .lock()
    .await
    .set_password("workbook", Some("secret-password".into()))
    .unwrap();
  assert!(second.session.lock().await.authorized.is_empty());
  assert!(
    second
      .session
      .lock()
      .await
      .password_for("workbook")
      .is_none()
  );
  let path = folder.path().join("map.brainstorming");
  root
    .documents
    .write(&path, fixture::workbook(), None, None, None)
    .await
    .unwrap();
  documents::open(&first, path.clone()).await.unwrap();
  assert!(documents::open(&second, path).await.is_err());
  backend.shutdown().await.unwrap();
}

#[tokio::test]
async fn transfer_preserves_native_undo_and_target_reload_does_not_clear_pending_history() {
  let folder = tempfile::tempdir().unwrap();
  let backend = Backend::start(folder.path().into(), None).await.unwrap();
  let state = &backend.state;
  state
    .windows
    .register("editor-second", Vec::new())
    .await
    .unwrap();
  state
    .windows
    .claim_editor("main", "workbook")
    .await
    .unwrap();
  state
    .editor
    .open("workbook".into(), fixture::workbook())
    .await
    .unwrap();
  let edited = state.editor.execute("workbook", 0, json!({"kind":"topic","sheetId":"sheet-a","command":{"type":"renameTopic","topicId":"root","title":"Unsaved transfer"}})).await.unwrap();
  state
    .windows
    .put_transfer(
      "transfer-token".into(),
      Transfer {
        source: "main".into(),
        target: "editor-second".into(),
        document_id: "workbook".into(),
        payload: json!({"workbook": edited.workbook}),
        completion: None,
      },
    )
    .await
    .unwrap();
  assert!(
    state
      .windows
      .assert_editor("main", "workbook")
      .await
      .is_err()
  );
  assert!(
    state
      .windows
      .assert_editor("editor-second", "workbook")
      .await
      .is_err()
  );
  assert!(
    state
      .windows
      .release_editors_for_reload("editor-second")
      .await
      .is_empty()
  );
  assert!(!state.windows.release_editor("main", "workbook").await);
  assert!(
    state
      .windows
      .accept_transfer("main", "transfer-token")
      .await
      .is_err()
  );
  assert!(state.windows.transfer("editor-second").await.is_some());
  state
    .windows
    .accept_transfer("editor-second", "transfer-token")
    .await
    .unwrap();
  assert!(state.windows.transfer("editor-second").await.is_none());
  let undone = state
    .editor
    .execute("workbook", edited.revision, json!({"kind":"undo"}))
    .await
    .unwrap();
  assert_eq!(undone.workbook, fixture::workbook());
  assert_eq!(state.windows.release_editors("main").await.len(), 0);
  assert!(state.editor.snapshot("workbook").await.is_ok());
  backend.shutdown().await.unwrap();
}

#[tokio::test]
async fn one_window_recovery_write_and_clear_preserves_the_other_window() {
  let folder = tempfile::tempdir().unwrap();
  let backend = Backend::start(folder.path().into(), None).await.unwrap();
  let state = &backend.state;
  state
    .windows
    .register("editor-second", Vec::new())
    .await
    .unwrap();
  let first = state.for_window("main").await.unwrap();
  let second = state.for_window("editor-second").await.unwrap();
  let mut other = fixture::workbook();
  other["id"] = json!("other-workbook");
  recovery::write(&first, &json!([fixture::workbook().to_string()]))
    .await
    .unwrap();
  recovery::write(&second, &json!([other.to_string()]))
    .await
    .unwrap();
  assert_eq!(state.metadata.recovery_index().await.unwrap().len(), 2);
  recovery::write(&first, &json!([])).await.unwrap();
  let entries = state.metadata.recovery_index().await.unwrap();
  assert_eq!(entries.len(), 1);
  assert_eq!(entries[0].document_id, "other-workbook");
  backend.shutdown().await.unwrap();
}

#[tokio::test]
async fn target_destroy_before_ack_preserves_source_tab_history_grants_and_password() {
  let folder = tempfile::tempdir().unwrap();
  let backend = Backend::start(folder.path().into(), None).await.unwrap();
  let state = &backend.state;
  state
    .windows
    .register("editor-second", Vec::new())
    .await
    .unwrap();
  let path = folder.path().join("source.brainstorming");
  state
    .documents
    .write(&path, fixture::workbook(), None, None, None)
    .await
    .unwrap();
  let path = path.canonicalize().unwrap();
  documents::open(state, path.clone()).await.unwrap();
  state
    .session
    .lock()
    .await
    .set_password("workbook", Some("memory-key".into()))
    .unwrap();
  state
    .editor
    .open("workbook".into(), fixture::workbook())
    .await
    .unwrap();
  let edited = state.editor.execute("workbook", 0, json!({"kind":"topic","sheetId":"sheet-a","command":{"type":"renameTopic","topicId":"root","title":"Keep pending changes"}})).await.unwrap();
  let (completion, result) = tokio::sync::oneshot::channel();
  state
    .windows
    .put_transfer(
      "pending".into(),
      Transfer {
        source: "main".into(),
        target: "editor-second".into(),
        document_id: "workbook".into(),
        payload: json!({"editor":{"workbook":edited.workbook}}),
        completion: Some(completion),
      },
    )
    .await
    .unwrap();
  assert!(
    state
      .windows
      .release_editors("editor-second")
      .await
      .is_empty()
  );
  state.windows.remove("editor-second").await;
  assert!(result.await.unwrap().is_err());
  assert!(
    state
      .windows
      .assert_editor("main", "workbook")
      .await
      .is_ok()
  );
  assert_eq!(
    state.windows.path_owner(&path).await,
    Some(("main".into(), "workbook".into()))
  );
  let session = state.session.lock().await;
  assert_eq!(session.password_for("workbook"), Some("memory-key"));
  assert!(session.authorized.contains(&path));
  assert!(session.retained.contains(&path));
  drop(session);
  let undo = state
    .editor
    .execute("workbook", edited.revision, json!({"kind":"undo"}))
    .await
    .unwrap();
  assert_eq!(undo.workbook, fixture::workbook());
  backend.shutdown().await.unwrap();
}
