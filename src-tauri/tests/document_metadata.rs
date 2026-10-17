use brainstorming_native::storage::{MetadataStore, RecoveryEntry};
use sha2::{Digest, Sha256};

#[tokio::test]
async fn metadata_prefs_recent_files_and_recovery_index_persist_and_validate_atomically() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("metadata.sqlite");
    let store = MetadataStore::new(&path).await.unwrap();
    store.set_language("zh-CN").await.unwrap();
    store
        .replace_recent_files(vec![
            "/maps/a.brainstorming".into(),
            "/maps/b.brainstorming".into(),
        ])
        .await
        .unwrap();
    let entry = RecoveryEntry {
        document_id: "test-document".into(),
        file_name: format!(
            "{}.{}.brainstorming",
            hex::encode(Sha256::digest(b"test-document")),
            uuid::Uuid::new_v4()
        ),
        protocol_version: 3,
    };
    store
        .replace_recovery_index(vec![entry.clone()])
        .await
        .unwrap();
    assert!(
        store
            .replace_recent_files(vec!["duplicate".into(), "duplicate".into()])
            .await
            .is_err()
    );
    assert!(
        store
            .replace_recovery_index(vec![RecoveryEntry {
                file_name: "../outside.brainstorming".into(),
                ..entry.clone()
            }])
            .await
            .is_err()
    );
    let reopened = MetadataStore::new(&path).await.unwrap();
    assert_eq!(reopened.language().await.unwrap(), Some("zh-CN".into()));
    assert_eq!(
        reopened.recent_files().await.unwrap(),
        vec!["/maps/a.brainstorming", "/maps/b.brainstorming"]
    );
    assert_eq!(
        reopened.recovery_index().await.unwrap()[0].file_name,
        entry.file_name
    );
    store.shutdown().await.unwrap();
    reopened.shutdown().await.unwrap();
}
