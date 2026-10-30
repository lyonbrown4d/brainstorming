#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_engine::{
  document::{DocumentStore, validate_workbook},
  editor_engine::EditorEngine,
};
use serde_json::{Value, json};

#[tokio::test]
async fn spatial_depth_command_preserves_value_and_rejects_out_of_range_change() {
  let engine = EditorEngine::default();
  engine
    .open("spatial-depth".into(), fixture::workbook())
    .await
    .unwrap();
  let command = |depth: Value| {
    json!({
      "kind":"topic","sheetId":"sheet-a","command":{
        "type":"setTopicStyle","topicId":"a","style":{"spatialDepth":depth}
      }
    })
  };
  let updated = engine
    .execute("spatial-depth", 0, command(json!(-1_000_000)))
    .await
    .unwrap();
  assert_eq!(
    updated.workbook["sheets"][0]["document"]["topics"]["a"]["style"]["spatialDepth"],
    -1_000_000
  );
  assert!(
    engine
      .execute("spatial-depth", 1, command(json!(1_000_000.1)))
      .await
      .is_err()
  );
  assert_eq!(
    engine.snapshot("spatial-depth").await.unwrap().workbook,
    updated.workbook
  );
}

#[tokio::test]
async fn spatial_depth_roundtrips_in_native_file_and_invalid_depth_preserves_it() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("depth.brainstorming");
  let store = DocumentStore::new();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["topics"]["a"]["style"]["spatialDepth"] = json!(1_000_000);
  assert!(validate_workbook(&workbook).is_ok());
  store
    .write(&path, workbook.clone(), None, None, None)
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  let mut invalid = workbook.clone();
  invalid["sheets"][0]["document"]["topics"]["a"]["style"]["spatialDepth"] = json!(-1_000_000.1);
  assert!(store.write(&path, invalid, None, None, None).await.is_err());
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  store.release(&path).await.unwrap();
}

#[tokio::test]
async fn spatial_settings_command_preserves_complete_settings_and_rejects_invalid_change() {
  let engine = EditorEngine::default();
  engine
    .open("spatial-settings".into(), fixture::workbook())
    .await
    .unwrap();
  let command = |spatial: Value| {
    json!({
      "kind":"topic","sheetId":"sheet-a","command":{
        "type":"setDocumentSettings", "settings":{"spatial":spatial}
      }
    })
  };
  let spatial = json!({"mode":"3d","yaw":std::f64::consts::PI,"pitch":-std::f64::consts::FRAC_PI_2,"spacing":200,"target":{"x":25,"y":-10,"z":1_000_000}});
  let updated = engine
    .execute("spatial-settings", 0, command(spatial.clone()))
    .await
    .unwrap();
  assert_eq!(
    updated.workbook["sheets"][0]["document"]["settings"]["spatial"],
    spatial
  );
  for invalid in [
    json!({"mode":"3d","yaw":0,"pitch":0}),
    json!({"mode":"3d","yaw":std::f64::consts::PI+0.01,"pitch":0,"spacing":0}),
    json!({"mode":"3d","yaw":0,"pitch":std::f64::consts::FRAC_PI_2+0.01,"spacing":0}),
    json!({"mode":"3d","yaw":0,"pitch":0,"spacing":0,"target":{"x":1_000_001,"y":0,"z":0}}),
    json!({"mode":"3d","yaw":0,"pitch":0,"spacing":0,"target":{"x":0,"y":0}}),
    json!({"mode":"3d","yaw":0,"pitch":0,"spacing":201}),
  ] {
    assert!(
      engine
        .execute("spatial-settings", 1, command(invalid))
        .await
        .is_err()
    );
  }
  assert_eq!(
    engine.snapshot("spatial-settings").await.unwrap().workbook,
    updated.workbook
  );
}

#[tokio::test]
async fn spatial_settings_roundtrip_in_native_file_and_invalid_settings_preserve_it() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("spatial-settings.brainstorming");
  let store = DocumentStore::new();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["settings"]["spatial"] = json!({"mode":"2d","yaw":-std::f64::consts::PI,"pitch":std::f64::consts::FRAC_PI_2,"spacing":0,"target":{"x":-1_000_000,"y":42,"z":8}});
  assert!(validate_workbook(&workbook).is_ok());
  store
    .write(&path, workbook.clone(), None, None, None)
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  let mut invalid = workbook.clone();
  invalid["sheets"][0]["document"]["settings"]["spatial"]["mode"] = json!("4d");
  assert!(store.write(&path, invalid, None, None, None).await.is_err());
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  store.release(&path).await.unwrap();
}
