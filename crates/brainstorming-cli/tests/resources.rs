#[path = "../../brainstorming-engine/tests/document_fixture.rs"]
mod fixture;
use brainstorming_engine::{
  document::{DocumentSnapshot, DocumentStore},
  document_exports::assets,
  storage::ResourceVault,
};
use serde_json::json;
use std::{process::Command, sync::Arc};

#[tokio::test]
async fn snapshot_hydrates_native_image_and_cli_renders_it_without_mutating_source() {
  let directory = tempfile::tempdir().unwrap();
  let vault = Arc::new(ResourceVault::new(directory.path()).await.unwrap());
  let image = include_bytes!("../../../tests/fixtures/xmind/pixel image.png").to_vec();
  let object = vault.import_bytes(image).await.unwrap();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["assets"] = json!({"image":{"id":"image","name":"pixel.png","mimeType":"image/png","storage":{"objectId":object.object_id,"byteLength":object.byte_length}}});
  workbook["sheets"][0]["document"]["topics"]["root"]["image"] =
    json!({"assetId":"image","width":40,"height":40});
  let store = DocumentStore::new();
  let input = directory.path().join("source.brainstorming");
  store
    .write(&input, workbook, None, None, Some(vault.clone()))
    .await
    .unwrap();
  store.shutdown().await.unwrap();
  vault.shutdown().await.unwrap();
  let original = std::fs::read(&input).unwrap();
  let snapshot = DocumentSnapshot::open(&input, None).await.unwrap();
  let hydrated = assets::hydrate(&snapshot, snapshot.workbook().clone(), false)
    .await
    .unwrap();
  assert!(
    hydrated["sheets"][0]["document"]["assets"]["image"]["data"]
      .as_str()
      .unwrap()
      .len()
      > 20
  );
  snapshot.close().await.unwrap();
  let output = directory.path().join("image.svg");
  let result = Command::new(env!("CARGO_BIN_EXE_brainstorming-cli"))
    .env_remove("DISPLAY")
    .env_remove("WAYLAND_DISPLAY")
    .arg("export")
    .arg(&input)
    .arg("-o")
    .arg(&output)
    .output()
    .unwrap();
  assert!(
    result.status.success(),
    "{}",
    String::from_utf8_lossy(&result.stderr)
  );
  let svg = std::fs::read_to_string(output).unwrap();
  assert!(svg.contains("data:image/png;base64,"));
  assert_eq!(std::fs::read(input).unwrap(), original);
}
