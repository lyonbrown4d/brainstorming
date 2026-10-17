#[path = "document_fixture.rs"]
mod fixture;
use base64::{Engine, engine::general_purpose::STANDARD};
use brainstorming_native::document::DocumentStore;
use serde_json::json;

#[tokio::test]
async fn inline_image_bytes_mime_dimensions_and_unused_assets_are_validated_natively() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("image.brainstorming");
    let store = DocumentStore::new();
    let png = include_bytes!("../../tests/fixtures/xmind/pixel image.png");
    let mut workbook = fixture::workbook();
    workbook["sheets"][0]["document"]["topics"]["a"]["image"] =
        json!({"assetId":"image","width":1,"height":1});
    workbook["sheets"][0]["document"]["assets"] = json!({"image":{"id":"image","name":"图片.png","mimeType":"image/png","data":STANDARD.encode(png)},"unused":{"id":"unused","name":"unused.bin","mimeType":"application/octet-stream","data":""}});
    let mut invalid = workbook.clone();
    invalid["sheets"][0]["document"]["assets"]["image"]["mimeType"] = json!("image/jpeg");
    assert!(store.write(&path, invalid, None, None, None).await.is_err());
    assert!(!path.exists());
    let mut invalid = workbook.clone();
    invalid["sheets"][0]["document"]["topics"]["a"]["image"]["width"] = json!(2);
    assert!(store.write(&path, invalid, None, None, None).await.is_err());
    assert!(!path.exists());
    let saved = store
        .write(&path, workbook, None, None, None)
        .await
        .unwrap();
    assert!(
        saved["sheets"][0]["document"]["assets"]
            .get("unused")
            .is_none()
    );
    assert_eq!(
        saved["sheets"][0]["document"]["assets"]["image"]["storage"]["width"],
        1
    );
    store.release(&path).await.unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("UPDATE topics SET data=json_set(data,'$.image.width',2) WHERE id='a'")
        .unwrap();
    drop(db);
    assert!(store.read(&path, None).await.is_err());
    store.release(&path).await.unwrap();
}

#[tokio::test]
async fn damaged_native_protocol_order_extensions_and_references_are_rejected() {
    let folder = tempfile::tempdir().unwrap();
    let store = DocumentStore::new();
    let mutations = [
        "PRAGMA application_id=1",
        "PRAGMA user_version=999",
        "UPDATE document SET required_features='[\"future-feature\"]'",
        "UPDATE topics SET parent_id='missing' WHERE id='a'",
        "UPDATE topics SET position=10 WHERE id='a'",
        "UPDATE topics SET data=json_set(data,'$.children',json('[]')) WHERE id='root'",
        "UPDATE sheets SET metadata=json_set(metadata,'$.settings.unsupported',1) WHERE id='sheet-a'",
        "UPDATE annotations SET data=json_set(data,'$.to','missing') WHERE kind='relations'",
        "UPDATE sheets SET metadata=json_set(metadata,'$.floatingPositions.missing',json('{\"x\":0,\"y\":0}')) WHERE id='sheet-a'",
        "UPDATE sheets SET metadata=json_set(metadata,'$.settings.layout','unsupported') WHERE id='sheet-a'",
        "UPDATE topics SET data=json_set(data,'$.structure','unsupported') WHERE id='a'",
    ];
    for (index, sql) in mutations.into_iter().enumerate() {
        let path = folder.path().join(format!("damaged-{index}.brainstorming"));
        store
            .write(&path, fixture::workbook(), None, None, None)
            .await
            .unwrap();
        store.release(&path).await.unwrap();
        let db = rusqlite::Connection::open(&path).unwrap();
        db.execute_batch(sql).unwrap();
        drop(db);
        assert!(
            store.read(&path, None).await.is_err(),
            "mutation should be rejected: {sql}"
        );
        store.release(&path).await.unwrap();
    }
}

#[tokio::test]
async fn queued_failed_first_save_cannot_delete_a_successful_document() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("queued.brainstorming");
    let store = DocumentStore::new();
    let valid = fixture::workbook();
    let mut invalid = valid.clone();
    invalid["sheets"][0]["document"]["assets"] = json!({"missing":{"id":"missing","name":"missing.bin","mimeType":"application/octet-stream","storage":{"objectId":"c".repeat(64),"byteLength":123}}});
    invalid["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["missing"]);
    let (success, failure) = tokio::join!(
        store.write(&path, valid.clone(), None, None, None),
        store.write(&path, invalid, None, None, None)
    );
    success.unwrap();
    assert!(failure.is_err());
    assert_eq!(store.read(&path, None).await.unwrap(), valid);
    store.release(&path).await.unwrap();
}

#[tokio::test]
async fn embedded_audio_and_opaque_audio_attachments_retain_native_references() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("audio.brainstorming");
    let store = DocumentStore::new();
    let mut wav = vec![0u8; 46];
    wav[..4].copy_from_slice(b"RIFF");
    wav[4..8].copy_from_slice(&38u32.to_le_bytes());
    wav[8..16].copy_from_slice(b"WAVEfmt ");
    wav[16..20].copy_from_slice(&16u32.to_le_bytes());
    wav[20..22].copy_from_slice(&1u16.to_le_bytes());
    wav[22..24].copy_from_slice(&1u16.to_le_bytes());
    wav[24..28].copy_from_slice(&8000u32.to_le_bytes());
    wav[28..32].copy_from_slice(&16000u32.to_le_bytes());
    wav[32..34].copy_from_slice(&2u16.to_le_bytes());
    wav[34..36].copy_from_slice(&16u16.to_le_bytes());
    wav[36..40].copy_from_slice(b"data");
    wav[40..44].copy_from_slice(&2u32.to_le_bytes());
    let mut workbook = fixture::workbook();
    workbook["sheets"][0]["document"]["topics"]["a"]["metadata"]["audioAssetId"] = json!("voice");
    workbook["sheets"][0]["document"]["assets"] = json!({"voice":{"id":"voice","name":"voice.wav","mimeType":"audio/wav","data":STANDARD.encode(&wav)}});
    let saved = store
        .write(&path, workbook.clone(), Some("audio-password"), None, None)
        .await
        .unwrap();
    assert_eq!(
        saved["sheets"][0]["document"]["topics"]["a"]["metadata"]["audioAssetId"],
        "voice"
    );
    let id = saved["sheets"][0]["document"]["assets"]["voice"]["storage"]["objectId"]
        .as_str()
        .unwrap();
    assert_eq!(
        store
            .read_resource(&path, id, 0, Some(46), Some("audio-password"))
            .await
            .unwrap(),
        wav
    );
    workbook["sheets"][0]["document"]["topics"]["a"]["metadata"]
        .as_object_mut()
        .unwrap()
        .remove("audioAssetId");
    workbook["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["voice"]);
    workbook["sheets"][0]["document"]["assets"]["voice"]["mimeType"] =
        json!("application/octet-stream");
    store
        .write(
            &path,
            workbook,
            Some("audio-password"),
            Some("audio-password"),
            None,
        )
        .await
        .unwrap();
    assert_eq!(
        store.read(&path, Some("audio-password")).await.unwrap()["sheets"][0]["document"]["assets"]
            ["voice"]["mimeType"],
        "application/octet-stream"
    );
    store.release(&path).await.unwrap();
}
