#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::document::{DocumentStore, ResourceSource};
use futures_util::future::BoxFuture;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{io::Cursor, sync::Arc, time::Duration};
use tokio::{
    io::AsyncRead,
    sync::{Notify, Semaphore},
};

type Reader = Box<dyn AsyncRead + Unpin + Send>;
struct HeldSource {
    entered: Notify,
    release: Semaphore,
}
impl ResourceSource for HeldSource {
    fn open<'a>(
        &'a self,
        _id: &'a str,
    ) -> BoxFuture<'a, brainstorming_native::document::Result<Reader>> {
        Box::pin(async move {
            self.entered.notify_one();
            self.release.acquire().await.unwrap().forget();
            Ok(Box::new(Cursor::new(b"payload".to_vec())) as Reader)
        })
    }
}

#[tokio::test]
async fn cancelled_callers_keep_save_and_rekey_owners_alive_until_files_are_closed() {
    // Both first publication and encrypted -> plaintext replacement hold a
    // temporary database while source I/O is pending.
    for rekey in [false, true] {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("cancel.brainstorming");
        let store = DocumentStore::new();
        if rekey {
            store
                .write(&path, fixture::workbook(), Some("previous-key"), None, None)
                .await
                .unwrap();
        }
        let id = hex::encode(Sha256::digest(b"payload"));
        let mut workbook = fixture::workbook();
        workbook["sheets"][0]["document"]["assets"] = json!({
            "held": {"id":"held","name":"held.bin","mimeType":"application/octet-stream",
                "storage":{"objectId":id,"byteLength":7}}
        });
        workbook["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["held"]);
        let source = Arc::new(HeldSource {
            entered: Notify::new(),
            release: Semaphore::new(0),
        });
        let worker_source = source.clone();
        let worker_path = path.clone();
        let pending = tokio::spawn(async move {
            DocumentStore::new()
                .write(
                    worker_path,
                    workbook,
                    None,
                    rekey.then_some("previous-key"),
                    Some(worker_source),
                )
                .await
        });
        tokio::time::timeout(Duration::from_secs(10), source.entered.notified())
            .await
            .unwrap();
        pending.abort();
        assert!(pending.await.unwrap_err().is_cancelled());
        if !rekey {
            assert!(!tokio::fs::try_exists(&path).await.unwrap());
        }
        source.release.add_permits(1);
        let read = tokio::time::timeout(Duration::from_secs(10), store.read(&path, None))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            read["sheets"][0]["document"]["topics"]["a"]["attachments"],
            json!(["held"])
        );
        assert_eq!(
            store
                .read_resource(&path, &id, 0, None, None)
                .await
                .unwrap(),
            b"payload"
        );
        store.release(&path).await.unwrap();
        let mut files = tokio::fs::read_dir(folder.path()).await.unwrap();
        let mut count = 0;
        while files.next_entry().await.unwrap().is_some() {
            count += 1;
        }
        assert_eq!(
            count, 1,
            "closed operations leave no temporary database behind"
        );
    }
}
