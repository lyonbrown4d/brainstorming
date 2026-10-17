#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::{
    document::DocumentStore,
    storage::{MetadataStore, ResourceVault},
};
use std::{io::Read, sync::mpsc, time::Duration};

struct HeldReader {
    entered: Option<tokio::sync::oneshot::Sender<()>>,
    release: mpsc::Receiver<()>,
}
impl Read for HeldReader {
    fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
        if let Some(entered) = self.entered.take() {
            entered.send(()).unwrap();
            self.release.recv().unwrap();
        }
        Ok(0)
    }
}

#[tokio::test]
async fn shutdown_closes_file_handles_and_prevents_new_native_operations() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("shutdown.brainstorming");
    let store = DocumentStore::new();
    store
        .write(
            &path,
            fixture::workbook(),
            Some("shutdown-pass"),
            None,
            None,
        )
        .await
        .unwrap();
    store.retain(&path, Some("shutdown-pass")).await.unwrap();
    let metadata = MetadataStore::new(folder.path().join("metadata.sqlite"))
        .await
        .unwrap();
    metadata.set_language("en").await.unwrap();
    let vault_directory = folder.path().join("vault");
    let vault = ResourceVault::new(&vault_directory).await.unwrap();
    let staged = vault
        .import_bytes(b"private staged original".to_vec())
        .await
        .unwrap();
    let mut entries = tokio::fs::read_dir(&vault_directory).await.unwrap();
    let bytes = tokio::fs::read(entries.next_entry().await.unwrap().unwrap().path())
        .await
        .unwrap();
    assert!(!bytes.starts_with(b"SQLite format 3"));
    assert!(
        !bytes
            .windows(23)
            .any(|window| window == b"private staged original")
    );
    vault.shutdown().await.unwrap();
    vault.shutdown().await.unwrap();
    assert!(vault.object_info(&staged.object_id).await.is_err());
    assert!(
        tokio::fs::read_dir(&vault_directory)
            .await
            .unwrap()
            .next_entry()
            .await
            .unwrap()
            .is_none()
    );
    let (entered, waiting) = tokio::sync::oneshot::channel();
    let (release, blocked) = mpsc::channel();
    let active_path = path.clone();
    let active = tokio::spawn(async move {
        DocumentStore::new()
            .import_reader(
                &active_path,
                Box::new(HeldReader {
                    entered: Some(entered),
                    release: blocked,
                }),
                Some("shutdown-pass"),
            )
            .await
    });
    waiting.await.unwrap();
    let mut shutdown = tokio::spawn(async { DocumentStore::new().shutdown().await });
    let unknown = folder.path().join("not-created.brainstorming");
    loop {
        let error = store.read(&unknown, None).await.unwrap_err();
        if error.to_string().contains("已关闭") {
            break;
        }
        tokio::task::yield_now().await;
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(25), &mut shutdown)
            .await
            .is_err()
    );
    assert!(store.read(&path, Some("shutdown-pass")).await.is_err());
    release.send(()).unwrap();
    active.await.unwrap().unwrap();
    shutdown.await.unwrap().unwrap();
    metadata.shutdown().await.unwrap();
    assert!(store.read(&path, Some("shutdown-pass")).await.is_err());
    assert!(metadata.language().await.is_err());
    std::fs::rename(&path, folder.path().join("closed.brainstorming")).unwrap();
}
