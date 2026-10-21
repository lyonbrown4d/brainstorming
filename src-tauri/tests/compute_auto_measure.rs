use brainstorming_native::{
  compute::{ComputeService, LayoutInput},
  layout_engine::NodeSize,
};
use serde_json::json;
use std::sync::Arc;

fn measured_input() -> LayoutInput {
  LayoutInput {
    document: json!({
      "format":"brainstorming","version":1,"id":"measured","title":"中心 Root","rootId":"root",
      "topics":{
        "root":{"id":"root","title":"中心 Root","children":["en","zh","shape","image","fixed"],"collapsed":false,"side":"right"},
        "en":{"id":"en","title":"Long English\nsecond line","children":[],"collapsed":false,"side":"right"},
        "zh":{"id":"zh","title":"中文长标题重复中文长标题","children":[],"collapsed":false,"side":"right"},
        "shape":{"id":"shape","title":"图形","children":[],"collapsed":false,"side":"right",
          "style":{"shape":"diamond","width":280,"scale":1.5}},
        "image":{"id":"image","title":"Photo","children":[],"collapsed":false,"side":"right",
          "image":{"assetId":"asset","width":400,"height":200},"notes":"备注",
          "metadata":{"markers":["star"],"markerStyle":{"position":"top","size":16}}},
        "fixed":{"id":"fixed","title":"Fixed","children":[],"collapsed":false,"side":"right",
          "style":{"shape":"card","width":240},"notes":"Details",
          "metadata":{"markers":["star","flag"],"markerStyle":{"position":"left","size":20}}}
      },
      "assets":{"asset":{"id":"asset","name":"image.png","mimeType":"image/png","data":"AA=="}},
      "settings":{"spatial":{"mode":"3d","yaw":0.3,"pitch":0.2,"spacing":100}}
    }),
    measurements: vec![],
  }
}

fn frontend_measurements() -> Vec<NodeSize> {
  [
    ("root", 180.0, 64.0),
    ("en", 164.0, 68.0),
    ("zh", 236.0, 44.0),
    ("shape", 420.0, 132.0),
    ("image", 256.0, 224.0),
    ("fixed", 240.0, 120.0),
  ]
  .into_iter()
  .map(|(id, width, height)| NodeSize {
    id: id.into(),
    width,
    height,
  })
  .collect()
}

#[tokio::test]
async fn empty_measurements_match_explicit_frontend_sizes_in_2d_and_3d() {
  let compute = ComputeService::default();
  let empty = measured_input();
  let automatic = compute.layout(empty.clone()).await.unwrap();
  let widths = frontend_measurements();
  for expected in &widths {
    let actual = automatic
      .nodes
      .iter()
      .find(|node| node.id == expected.id)
      .unwrap();
    assert_eq!(
      (actual.width, actual.height),
      (expected.width, expected.height)
    );
  }
  let explicit = LayoutInput {
    measurements: widths,
    ..empty.clone()
  };
  let specified = compute.layout(explicit.clone()).await.unwrap();
  assert_eq!(
    serde_json::to_value(&*automatic).unwrap(),
    serde_json::to_value(&*specified).unwrap()
  );
  let spatial = compute.spatial_layout(empty).await.unwrap();
  let spatial_specified = compute.spatial_layout(explicit).await.unwrap();
  assert_eq!(
    serde_json::to_value(&spatial.layout).unwrap(),
    serde_json::to_value(&spatial_specified.layout).unwrap()
  );
  assert_eq!(spatial.depths, spatial_specified.depths);
}

#[tokio::test]
async fn empty_measurements_reuse_cache_and_shutdown_rejects_later_requests() {
  let compute = ComputeService::default();
  let input = measured_input();
  let first = compute.layout(input.clone()).await.unwrap();
  let cached = compute.layout(input.clone()).await.unwrap();
  assert!(Arc::ptr_eq(&first, &cached));
  let first_spatial = compute.spatial_layout(input.clone()).await.unwrap();
  let cached_spatial = compute.spatial_layout(input.clone()).await.unwrap();
  assert!(Arc::ptr_eq(&first_spatial, &cached_spatial));
  compute.shutdown().await;
  assert!(compute.layout(input.clone()).await.is_err());
  assert!(compute.spatial_layout(input).await.is_err());
}

#[tokio::test]
async fn explicit_measurements_remain_authoritative() {
  let compute = ComputeService::default();
  let mut input = measured_input();
  input.measurements = frontend_measurements();
  input.measurements[0].width = 310.0;
  let layout = compute.layout(input).await.unwrap();
  let root = layout.nodes.iter().find(|node| node.id == "root").unwrap();
  assert_eq!(root.width, 310.0);
}
