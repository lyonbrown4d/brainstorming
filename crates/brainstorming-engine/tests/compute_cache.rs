use brainstorming_engine::compute::{ComputeService, LayoutInput};
use serde_json::json;
use std::sync::Arc;

fn input() -> LayoutInput {
  LayoutInput {
    document: json!({
      "format":"brainstorming", "version":1, "id":"map", "title":"Root", "rootId":"root",
      "topics":{"root":{"id":"root","title":"Root","children":[],"collapsed":false,"side":"right"}}
    }),
    measurements: vec![brainstorming_engine::layout_engine::NodeSize {
      id: "root".into(),
      width: 180.0,
      height: 64.0,
    }],
  }
}

#[tokio::test]
async fn repeated_layout_reuses_result_and_invalidation_recomputes() {
  let compute = ComputeService::default();
  let first = compute.layout(input()).await.unwrap();
  let cached = compute.layout(input()).await.unwrap();
  assert!(Arc::ptr_eq(&first, &cached));
  compute.invalidate();
  let next = compute.layout(input()).await.unwrap();
  assert!(!Arc::ptr_eq(&first, &next));
}

#[tokio::test]
async fn spatial_layout_cache_ignores_camera_rotation_and_target() {
  let compute = ComputeService::default();
  let mut original = input();
  original.document["settings"] = json!({
    "spatial": {"mode":"3d","yaw":0.4,"pitch":0.2,"spacing":100,
      "target":{"x":10,"y":20,"z":30}}
  });
  let first = compute.spatial_layout(original.clone()).await.unwrap();
  let mut camera_only = original.clone();
  camera_only.document["settings"]["spatial"]["yaw"] = json!(-1.1);
  camera_only.document["settings"]["spatial"]["pitch"] = json!(0.6);
  camera_only.document["settings"]["spatial"]["target"] = json!({"x":-500,"y":450,"z":1_000_000});
  let cached = compute.spatial_layout(camera_only.clone()).await.unwrap();
  assert!(Arc::ptr_eq(&first, &cached));

  camera_only.document["settings"]["spatial"]["spacing"] = json!(120);
  let changed = compute.spatial_layout(camera_only).await.unwrap();
  assert!(!Arc::ptr_eq(&first, &changed));
}

#[tokio::test]
async fn single_canvas_layout_accepts_a_link_to_another_sheet() {
  let compute = ComputeService::default();
  let mut value = input();
  value.document["topics"]["root"]["metadata"] = json!({"link":{
    "kind":"topic", "sheetId":"other-sheet", "topicId":"other-root"
  }});
  assert_eq!(compute.layout(value).await.unwrap().nodes.len(), 1);
}

#[tokio::test]
async fn shutdown_rejects_cached_and_new_work() {
  let compute = ComputeService::default();
  compute.layout(input()).await.unwrap();
  compute.shutdown().await;
  assert!(compute.layout(input()).await.is_err());
  assert!(compute.run(|| Ok(())).await.is_err());
}
