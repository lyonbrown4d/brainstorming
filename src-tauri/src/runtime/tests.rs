use super::{AppState, documents, recovery};
use serde_json::json;
#[path = "../../tests/document_fixture.rs"]
mod fixture;

#[tokio::test]
async fn save_requires_a_native_selected_destination() {
    let directory = tempfile::tempdir().unwrap();
    let state = AppState::new(directory.path().join("state")).await.unwrap();
    let destination = directory.path().join("unauthorized.brainstorming");
    let request = json!({"contents":fixture::workbook().to_string()});
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
        state.documents.read(destination, None).await.unwrap()["id"],
        "workbook"
    );
}

#[tokio::test]
async fn failed_workspace_write_keeps_the_previous_generation() {
    let directory = tempfile::tempdir().unwrap();
    let state = AppState::new(directory.path().to_path_buf()).await.unwrap();
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
}

#[tokio::test]
async fn encrypted_recovery_requires_unlock_activation_and_tracks_password_changes() {
    let directory = tempfile::tempdir().unwrap();
    let state = AppState::new(directory.path().to_path_buf()).await.unwrap();
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
}

#[tokio::test]
async fn resource_preparation_failure_rolls_back_recovery_password() {
    let directory = tempfile::tempdir().unwrap();
    let state = AppState::new(directory.path().to_path_buf()).await.unwrap();
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
}

#[tokio::test]
async fn failed_unlock_activation_keeps_credentials_unpublished_and_token_retryable() {
    let directory = tempfile::tempdir().unwrap();
    let state = AppState::new(directory.path().to_path_buf()).await.unwrap();
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
}
