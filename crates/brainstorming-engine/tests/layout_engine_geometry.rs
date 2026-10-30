use brainstorming_engine::layout_engine::{NodeSize, compute};
use serde_json::{Value, json};

fn topic(id: &str, children: &[&str], side: &str) -> Value {
  json!({ "id": id, "title": id, "children": children, "side": side, "collapsed": false })
}

fn document(kind: &str) -> Value {
  json!({
    "rootId": "root", "settings": { "layout": kind },
    "topics": {
      "root": topic("root", &["a", "b"], "right"),
      "a": topic("a", &["a1"], "right"),
      "a1": topic("a1", &[], "right"),
      "b": topic("b", &[], "left"),
    }
  })
}

fn sizes() -> Vec<NodeSize> {
  ["root", "a", "a1", "b"]
    .into_iter()
    .map(|id| NodeSize {
      id: id.into(),
      width: if id == "root" { 180.0 } else { 112.0 },
      height: if id == "root" { 64.0 } else { 44.0 },
    })
    .collect()
}

fn close(actual: f64, expected: f64) {
  assert!((actual - expected).abs() < 1e-7, "{actual} != {expected}");
}

#[test]
fn all_fifteen_structures_match_typescript_coordinates() {
  // Captured from src/layout/index.ts layoutDocument with the four measured cards above.
  let cases: [(&str, [[f64; 2]; 3], usize); 15] = [
    ("map", [[162.0, -22.0], [346.0, -22.0], [-274.0, -22.0]], 0),
    (
      "logic-right",
      [[162.0, -56.0], [346.0, -56.0], [162.0, 12.0]],
      0,
    ),
    (
      "logic-left",
      [[-274.0, -56.0], [-458.0, -56.0], [-274.0, 12.0]],
      0,
    ),
    (
      "org-down",
      [[-124.0, 104.0], [-124.0, 220.0], [12.0, 104.0]],
      0,
    ),
    (
      "org-up",
      [[-124.0, -148.0], [-124.0, -264.0], [12.0, -148.0]],
      0,
    ),
    (
      "tree-down",
      [[-90.0, 96.0], [-90.0, 204.0], [46.0, 96.0]],
      0,
    ),
    (
      "tree-up",
      [[-90.0, -140.0], [-90.0, -248.0], [46.0, -140.0]],
      0,
    ),
    (
      "brace-right",
      [[162.0, -56.0], [346.0, -56.0], [162.0, 12.0]],
      2,
    ),
    (
      "brace-left",
      [[-274.0, -56.0], [-458.0, -56.0], [-274.0, 12.0]],
      2,
    ),
    (
      "fishbone",
      [[162.0, -164.0], [162.0, -280.0], [370.0, 120.0]],
      1,
    ),
    (
      "timeline",
      [[162.0, -22.0], [162.0, 94.0], [370.0, -22.0]],
      1,
    ),
    (
      "timeline-vertical",
      [[-56.0, 104.0], [128.0, 104.0], [-56.0, 244.0]],
      1,
    ),
    (
      "tree-table-right",
      [[122.0, -60.0], [266.0, -60.0], [122.0, 16.0]],
      4,
    ),
    (
      "tree-table-down",
      [[-128.0, 64.0], [-128.0, 140.0], [16.0, 64.0]],
      4,
    ),
    (
      "matrix",
      [[-128.0, 112.0], [-128.0, 188.0], [16.0, 112.0]],
      6,
    ),
  ];
  for (kind, expected, decorations) in cases {
    let layout = compute(&document(kind), &sizes()).unwrap();
    assert_eq!(layout.nodes.len(), 4, "{kind}");
    assert_eq!(layout.edges.len(), 3, "{kind}");
    assert_eq!(layout.decorations.len(), decorations, "{kind}");
    for (id, [x, y]) in ["a", "a1", "b"].into_iter().zip(expected) {
      let node = layout.nodes.iter().find(|item| item.id == id).unwrap();
      close(node.x, x);
      close(node.y, y);
    }
  }
}

#[test]
fn mixed_components_and_floating_roots_preserve_edges_and_positions() {
  let mut value = document("fishbone");
  value["topics"]["a"]["structure"] = json!("tree-table-right");
  value["topics"]["floating"] = topic("floating", &["floating-child"], "right");
  value["topics"]["floating-child"] = topic("floating-child", &[], "right");
  value["floatingIds"] = json!(["floating"]);
  value["floatingPositions"] = json!({ "floating": { "x": 3000, "y": -900 } });
  let mut sizes = sizes();
  sizes.extend(["floating", "floating-child"].map(|id| NodeSize {
    id: id.into(),
    width: 112.0,
    height: 44.0,
  }));
  let layout = compute(&value, &sizes).unwrap();
  let floating = layout
    .nodes
    .iter()
    .find(|item| item.id == "floating")
    .unwrap();
  close(floating.x, 3000.0);
  close(floating.y, -900.0);
  assert!(!layout.edges.iter().any(|edge| edge.target == "floating"));
  assert!(
    layout
      .edges
      .iter()
      .any(|edge| edge.source == "floating" && edge.target == "floating-child")
  );
  let nested = layout.nodes.iter().find(|item| item.id == "a").unwrap();
  assert_eq!(nested.direction.as_deref(), Some("right"));
  assert!(layout.decorations.iter().any(|item| item.id == "cell-a"));
  let rib = layout.edges.iter().find(|item| item.target == "a").unwrap();
  let endpoint = rib.waypoints.as_ref().unwrap().last().unwrap();
  close(endpoint.x, nested.x + nested.width / 2.0);
  close(endpoint.y, nested.y + nested.height);
}

#[test]
fn collapsed_manual_and_summary_subtrees() {
  let mut value = document("map");
  value["topics"]["a"]["style"] = json!({ "offsetX": 45, "offsetY": -20 });
  let offset = compute(&value, &sizes()).unwrap();
  let a = offset.nodes.iter().find(|item| item.id == "a").unwrap();
  let a1 = offset.nodes.iter().find(|item| item.id == "a1").unwrap();
  close(a.x, 207.0);
  close(a.y, -42.0);
  close(a1.x, 391.0);
  close(a1.y, -42.0);
  value["topics"]["a"]["collapsed"] = json!(true);
  let collapsed = compute(&value, &sizes()).unwrap();
  assert!(!collapsed.nodes.iter().any(|item| item.id == "a1"));
  assert!(!collapsed.edges.iter().any(|item| item.target == "a1"));
  value["topics"]["summary"] = topic("summary", &["detail"], "right");
  value["topics"]["detail"] = topic("detail", &[], "right");
  value["topics"]["root"]["children"] = json!(["a", "b", "summary"]);
  value["groups"] = json!([{ "id": "group", "kind": "summary", "topicIds": ["a", "b"], "summaryTopicId": "summary" }]);
  let mut sizes = sizes();
  sizes.extend(["summary", "detail"].map(|id| NodeSize {
    id: id.into(),
    width: 112.0,
    height: 44.0,
  }));
  let layout = compute(&value, &sizes).unwrap();
  let summary = layout
    .nodes
    .iter()
    .find(|item| item.id == "summary")
    .unwrap();
  let right = layout
    .nodes
    .iter()
    .filter(|item| item.id == "a" || item.id == "b")
    .map(|item| item.x + item.width)
    .fold(f64::NEG_INFINITY, f64::max);
  assert!(summary.x > right);
  assert!(!layout.edges.iter().any(|edge| edge.target == "summary"));
  assert!(
    layout
      .edges
      .iter()
      .any(|edge| edge.source == "summary" && edge.target == "detail")
  );
}

#[test]
fn deep_trees_and_alternating_components_are_iterative() {
  for (kind, count, alternating) in [
    ("logic-right", 5000, false),
    ("matrix", 5000, false),
    ("map", 1500, true),
  ] {
    let mut topics = serde_json::Map::new();
    let mut measurements = Vec::new();
    for index in 0..count {
      let id = format!("n{index}");
      let children = if index + 1 < count {
        vec![format!("n{}", index + 1)]
      } else {
        Vec::new()
      };
      let structure = alternating.then_some({
        if index % 2 == 0 {
          "logic-right"
        } else {
          "org-down"
        }
      });
      topics.insert(
        id.clone(),
        json!({
          "id": id, "title": id, "children": children, "side": "right",
          "collapsed": false, "structure": structure,
        }),
      );
      measurements.push(NodeSize {
        id,
        width: 112.0,
        height: 44.0,
      });
    }
    let document = json!({ "rootId": "n0", "topics": topics, "settings": { "layout": kind } });
    let layout = compute(&document, &measurements).unwrap();
    assert_eq!(layout.nodes.len(), count);
    assert_eq!(layout.edges.len(), count - 1);
    assert!(
      layout
        .nodes
        .iter()
        .all(|node| node.x.is_finite() && node.y.is_finite())
    );
  }
}
