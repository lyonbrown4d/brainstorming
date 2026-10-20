use brainstorming_native::compute::{ComputeService, LayoutInput};
use serde_json::json;
use std::sync::Arc;

fn input() -> LayoutInput {
  LayoutInput {
    document: json!({
      "format":"brainstorming", "version":1, "id":"map", "title":"Root", "rootId":"root",
      "topics":{"root":{"id":"root","title":"Root","children":[],"collapsed":false,"side":"right"}}
    }),
    measurements: vec![brainstorming_native::layout_engine::NodeSize {
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
