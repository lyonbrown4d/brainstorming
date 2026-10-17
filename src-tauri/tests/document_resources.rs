#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_native::{
    document::{Derivatives, DocumentStore, Preview, RESOURCE_CHUNK_BYTES, Tile},
    storage::ResourceVault,
};
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn chunked_resources_deduplicate_verify_ranges_and_survive_save_as_and_history() {
    let folder = tempfile::tempdir().unwrap();
    let vault = Arc::new(ResourceVault::new(folder.path()).await.unwrap());
    let bytes: Vec<u8> = (0..RESOURCE_CHUNK_BYTES * 2 + 731)
        .map(|i| (i % 251) as u8)
        .collect();
    let original = vault.import_bytes(bytes.clone()).await.unwrap();
    assert_eq!(vault.import_bytes(bytes.clone()).await.unwrap(), original);
    let preview = vault
        .import_bytes(b"preview-payload".to_vec())
        .await
        .unwrap();
    let tile = vault.import_bytes(b"tile-payload".to_vec()).await.unwrap();
    vault
        .set_derivatives(
            &original.object_id,
            Derivatives {
                preview: Some(Preview {
                    object_id: preview.object_id.clone(),
                    mime_type: "image/webp".into(),
                    width: 20,
                    height: 10,
                }),
                tiles: vec![Tile {
                    object_id: tile.object_id.clone(),
                    level: 1,
                    x: 0,
                    y: 0,
                }],
            },
        )
        .await
        .unwrap();
    let mut workbook = fixture::workbook();
    workbook["sheets"][0]["document"]["assets"] = json!({"asset":{"id":"asset","name":"resource.bin","mimeType":"application/octet-stream","storage":{"objectId":original.object_id,"byteLength":original.byte_length}}});
    workbook["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["asset"]);
    let store = DocumentStore::new();
    let path = folder.path().join("source.brainstorming");
    let saved = store
        .write(&path, workbook, None, None, Some(vault.clone()))
        .await
        .unwrap();
    let read = store
        .read_resource(
            &path,
            &original.object_id,
            (RESOURCE_CHUNK_BYTES - 17) as u64,
            Some(65),
            None,
        )
        .await
        .unwrap();
    assert_eq!(
        read,
        bytes[RESOURCE_CHUNK_BYTES - 17..RESOURCE_CHUNK_BYTES + 48]
    );
    assert!(
        store
            .read_resource(&path, &original.object_id, 0, Some(17 * 1024 * 1024), None)
            .await
            .is_err()
    );
    assert_eq!(
        store
            .image_tile(&path, &original.object_id, 1, 0, 0, None)
            .await
            .unwrap(),
        Some(tile.object_id)
    );
    assert_eq!(
        saved["sheets"][0]["document"]["assets"]["asset"]["storage"]["preview"]["objectId"],
        preview.object_id
    );
    let copy = folder.path().join("copy.brainstorming");
    store
        .write(
            &copy,
            saved.clone(),
            Some("save-as-pass"),
            None,
            Some(store.source(&path, None).await.unwrap()),
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .read_resource(
                &copy,
                &original.object_id,
                0,
                Some(bytes.len() as u64),
                Some("save-as-pass")
            )
            .await
            .unwrap(),
        bytes
    );
    let revision = store.revisions(&path, None).await.unwrap()[0].id.clone();
    let mut without = saved;
    without["sheets"][0]["document"]
        .as_object_mut()
        .unwrap()
        .remove("assets");
    without["sheets"][0]["document"]["topics"]["a"]
        .as_object_mut()
        .unwrap()
        .remove("attachments");
    store
        .write(&path, without.clone(), None, None, None)
        .await
        .unwrap();
    assert_eq!(store.compact(&path, vec![], None).await.unwrap(), 0);
    store
        .restore_revision(&path, &revision, None)
        .await
        .unwrap();
    assert_eq!(
        store
            .read_resource(&path, &original.object_id, 0, Some(20), None)
            .await
            .unwrap(),
        bytes[..20]
    );
    for _ in 0..21 {
        store
            .write(&path, without.clone(), None, None, None)
            .await
            .unwrap();
    }
    assert_eq!(store.revisions(&path, None).await.unwrap().len(), 20);
    assert_eq!(
        store
            .compact(&path, vec![original.object_id.clone()], None)
            .await
            .unwrap(),
        0
    );
    assert_eq!(store.compact(&path, vec![], None).await.unwrap(), 3);
    assert!(
        store
            .read_resource(&path, &original.object_id, 0, Some(1), None)
            .await
            .is_err()
    );
    store.release(&path).await.unwrap();
    store.release(&copy).await.unwrap();
}

#[tokio::test]
async fn corrupt_chunk_is_rejected_instead_of_served_and_inline_imports_become_storage_references()
{
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("corrupt.brainstorming");
    let store = DocumentStore::new();
    let mut workbook = fixture::workbook();
    workbook["sheets"][0]["document"]["assets"] = json!({"file":{"id":"file","name":"file.txt","mimeType":"application/octet-stream","data":"aGVsbG8="}});
    workbook["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["file"]);
    let saved = store
        .write(&path, workbook, None, None, None)
        .await
        .unwrap();
    assert!(
        saved["sheets"][0]["document"]["assets"]["file"]
            .get("data")
            .is_none()
    );
    let oid = saved["sheets"][0]["document"]["assets"]["file"]["storage"]["objectId"]
        .as_str()
        .unwrap();
    store.release(&path).await.unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute(
        "UPDATE resource_chunks SET data=x'0000000000' WHERE object_id=?1",
        [oid],
    )
    .unwrap();
    drop(db);
    assert!(
        store
            .read_resource(&path, oid, 0, Some(5), None)
            .await
            .is_err()
    );
    store.release(&path).await.unwrap();
}
