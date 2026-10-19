use super::{Backend, services};
use crate::document::DocumentStore;
use crate::document_fixture as fixture;
use fluxdi::Application;
use serde_json::json;
use std::{sync::Arc, time::Duration};

#[tokio::test]
async fn injected_services_share_one_context_and_separate_applications_stay_usable() {
    let folder = tempfile::tempdir().unwrap();
    let backend = Backend::start(folder.path().join("first"), None)
        .await
        .unwrap();
    let other = Backend::start(folder.path().join("second"), None)
        .await
        .unwrap();
    let state = &backend.state;
    let path = folder.path().join("map.brainstorming");
    state
        .documents
        .write(&path, fixture::workbook(), None, None, None)
        .await
        .unwrap();
    let first_tab = state.documents.clone();
    let second_tab = state.documents.clone();
    first_tab.retain(&path, None).await.unwrap();
    second_tab.retain(&path, None).await.unwrap();
    first_tab.release(&path).await.unwrap();
    assert_eq!(
        second_tab.read(&path, None).await.unwrap(),
        fixture::workbook()
    );
    assert!(Arc::ptr_eq(&first_tab, &second_tab));
    assert!(!Arc::ptr_eq(&state.documents, &other.state.documents));
    backend.shutdown().await.unwrap();
    assert!(second_tab.read(&path, None).await.is_err());
    assert_eq!(
        other.state.documents.read(&path, None).await.unwrap(),
        fixture::workbook()
    );
    other.shutdown().await.unwrap();
}

#[tokio::test]
async fn typed_module_imports_preserve_provider_identity_for_the_application() {
    let folder = tempfile::tempdir().unwrap();
    let module = services(folder.path().to_owned(), None);
    let graph = module.graph.clone();
    let core = Arc::downgrade(&module._core);
    let mut app = Application::new(module);
    app.bootstrap().await.unwrap();
    let state = graph.state().await.unwrap();
    let sibling = graph.clone().create_child();
    assert!(Arc::ptr_eq(&state.documents, &sibling.documents().unwrap()));
    assert!(Arc::ptr_eq(
        &state.metadata,
        &sibling.metadata().await.unwrap()
    ));
    assert!(Arc::ptr_eq(&state.vault, &sibling.vault().await.unwrap()));
    assert!(Arc::ptr_eq(
        &state.session,
        &sibling.session().await.unwrap().session
    ));
    assert!(Arc::ptr_eq(&state.ai, &sibling.ai().unwrap()));
    assert!(Arc::ptr_eq(&state.mcp, &sibling.mcp().unwrap()));
    assert!(Arc::ptr_eq(&state.search, &sibling.search().await.unwrap()));
    app.shutdown().await.unwrap();
    assert!(state.metadata.language().await.is_err());
    assert!(state.vault.import_bytes(vec![1]).await.is_err());
    assert!(
        state
            .search
            .search(crate::search::SearchContent {
                query: "closed".into(),
                limit: None,
            })
            .await
            .is_err()
    );
    assert!(
        core.upgrade().is_none(),
        "the cached container must not retain itself after shutdown"
    );
}

#[tokio::test]
async fn failed_vault_start_rolls_back_metadata_and_a_fresh_graph_can_retry() {
    let folder = tempfile::tempdir().unwrap();
    tokio::fs::write(folder.path().join("resource-vault"), b"not a directory")
        .await
        .unwrap();
    let module = services(folder.path().to_owned(), None);
    let graph = module.graph.clone();
    let core = Arc::downgrade(&module._core);
    let mut app = Application::new(module);
    assert!(app.bootstrap().await.is_err());
    assert!(!app.is_bootstrapped());
    assert!(
        core.upgrade().is_none(),
        "failed startup must release its container"
    );
    let metadata = graph.metadata().await.unwrap();
    assert!(
        metadata.language().await.is_err(),
        "rollback must close the already opened database"
    );
    tokio::fs::remove_file(folder.path().join("resource-vault"))
        .await
        .unwrap();
    let retry = Backend::start(folder.path().to_owned(), None)
        .await
        .unwrap();
    retry.state.metadata.set_language("zh-CN").await.unwrap();
    assert_eq!(
        retry.state.metadata.language().await.unwrap().as_deref(),
        Some("zh-CN")
    );
    retry.shutdown().await.unwrap();
    let reopened = Backend::start(folder.path().to_owned(), None)
        .await
        .unwrap();
    assert_eq!(reopened.state.language.read().unwrap().as_str(), "zh-CN");
    reopened.shutdown().await.unwrap();
}

#[tokio::test]
async fn shutdown_survives_caller_cancellation_drains_commands_and_clears_secrets() {
    let folder = tempfile::tempdir().unwrap();
    let backend = Arc::new(
        Backend::start(folder.path().to_owned(), None)
            .await
            .unwrap(),
    );
    let state = backend.state.clone();
    state
        .session
        .lock()
        .await
        .set_password("workbook", Some("example-secret".into()))
        .unwrap();
    let staged = state
        .vault
        .import_bytes(b"temporary private bytes".to_vec())
        .await
        .unwrap();
    let lease = backend.acquire().await.unwrap();
    let closing = backend.clone();
    let mut task = tokio::spawn(async move { closing.shutdown().await });
    assert!(
        tokio::time::timeout(Duration::from_millis(25), &mut task)
            .await
            .is_err()
    );
    // Work already admitted is allowed to finish while shutdown waits.
    state.metadata.set_language("en").await.unwrap();
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    drop(lease);
    tokio::time::timeout(Duration::from_secs(10), async {
        while state.metadata.language().await.is_ok() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(backend.acquire().await.is_err());
    assert!(state.metadata.language().await.is_err());
    assert!(state.vault.object_info(&staged.object_id).await.is_err());
    assert!(
        state
            .session
            .lock()
            .await
            .password_for("workbook")
            .is_none()
    );
    assert!(
        tokio::fs::read_dir(folder.path().join("resource-vault"))
            .await
            .unwrap()
            .next_entry()
            .await
            .unwrap()
            .is_none()
    );
    backend.shutdown().await.unwrap();
    let store = DocumentStore::new();
    let path = folder.path().join("independent.brainstorming");
    store
        .write(&path, fixture::workbook(), None, None, None)
        .await
        .unwrap();
    assert_eq!(
        store.read(&path, None).await.unwrap()["id"],
        json!("workbook")
    );
    store.shutdown().await.unwrap();
}

#[tokio::test]
async fn an_unclaimed_backend_runs_async_cleanup() {
    let folder = tempfile::tempdir().unwrap();
    let backend = Backend::start(folder.path().to_owned(), None)
        .await
        .unwrap();
    let state = backend.state.clone();
    drop(backend);
    tokio::time::timeout(Duration::from_secs(10), async {
        while state.metadata.language().await.is_ok() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(state.vault.import_bytes(vec![1]).await.is_err());
    assert!(
        state
            .search
            .search(crate::search::SearchContent {
                query: "closed".into(),
                limit: None,
            })
            .await
            .is_err()
    );
    assert!(
        tokio::fs::read_dir(folder.path().join("resource-vault"))
            .await
            .unwrap()
            .next_entry()
            .await
            .unwrap()
            .is_none()
    );
}
