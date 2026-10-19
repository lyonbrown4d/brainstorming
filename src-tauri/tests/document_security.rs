#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::document::{DocumentStore, is_encrypted};
use serde_json::json;

#[tokio::test]
async fn sqlcipher_wrong_password_rekey_and_plaintext_transitions_preserve_data() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("protected.brainstorming");
  let store = DocumentStore::new();
  let workbook = fixture::workbook();
  store
    .write(&path, workbook.clone(), Some("first-'pass密钥"), None, None)
    .await
    .unwrap();
  assert!(is_encrypted(&path).await.unwrap());
  assert!(store.read(&path, Some("wrong-pass")).await.is_err());
  assert!(store.read(&path, None).await.is_err());
  assert_eq!(
    store.read(&path, Some("first-'pass密钥")).await.unwrap(),
    workbook
  );
  store
    .rekey(&path, Some("first-'pass密钥"), Some("second-'pass密钥"))
    .await
    .unwrap();
  assert!(store.read(&path, Some("first-'pass密钥")).await.is_err());
  assert_eq!(
    store.read(&path, Some("second-'pass密钥")).await.unwrap(),
    workbook
  );
  store
    .rekey(&path, Some("second-'pass密钥"), None)
    .await
    .unwrap();
  assert!(!is_encrypted(&path).await.unwrap());
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  store.rekey(&path, None, Some("third-pass")).await.unwrap();
  assert!(is_encrypted(&path).await.unwrap());
  assert_eq!(
    store.read(&path, Some("third-pass")).await.unwrap(),
    workbook
  );
  store.release(&path).await.unwrap();
}

#[tokio::test]
async fn failed_combined_content_and_password_change_leaves_old_content_and_key() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("rollback.brainstorming");
  let store = DocumentStore::new();
  let workbook = fixture::workbook();
  store
    .write(&path, workbook.clone(), Some("old-pass"), None, None)
    .await
    .unwrap();
  for _ in 0..20 {
    store
      .write(
        &path,
        workbook.clone(),
        Some("old-pass"),
        Some("old-pass"),
        None,
      )
      .await
      .unwrap();
  }
  let previous_revisions = store
    .revisions(&path, Some("old-pass"))
    .await
    .unwrap()
    .into_iter()
    .map(|revision| revision.id)
    .collect::<Vec<_>>();
  let mut changed = workbook.clone();
  changed["title"] = json!("未提交的新内容");
  changed["sheets"][0]["document"]["assets"] = json!({"missing":{"id":"missing","name":"missing.bin","mimeType":"application/octet-stream","storage":{"objectId":"b".repeat(64),"byteLength":4096}}});
  changed["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["missing"]);
  assert!(
    store
      .write(&path, changed, Some("new-pass"), Some("old-pass"), None)
      .await
      .is_err()
  );
  assert_eq!(store.read(&path, Some("old-pass")).await.unwrap(), workbook);
  assert!(store.read(&path, Some("new-pass")).await.is_err());
  assert_eq!(
    store
      .revisions(&path, Some("old-pass"))
      .await
      .unwrap()
      .into_iter()
      .map(|revision| revision.id)
      .collect::<Vec<_>>(),
    previous_revisions
  );
  store.release(&path).await.unwrap();
}

#[tokio::test]
async fn unsupported_legacy_containers_and_incomplete_headers_are_not_password_prompts() {
  let folder = tempfile::tempdir().unwrap();
  for (index, bytes) in [
    b"PK\x03\x04old-native-archive".as_slice(),
    b"{\"format\":\"brainstorming\",\"version\":2}".as_slice(),
    b"short".as_slice(),
  ]
  .into_iter()
  .enumerate()
  {
    let path = folder.path().join(format!("legacy-{index}.brainstorming"));
    tokio::fs::write(&path, bytes).await.unwrap();
    assert!(is_encrypted(&path).await.is_err());
  }
}
