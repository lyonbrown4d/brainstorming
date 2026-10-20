use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct NodeSize {
  pub id: String,
  pub width: f64,
  pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct Layout {
  pub nodes: Vec<LayoutNode>,
  pub edges: Vec<LayoutEdge>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub decorations: Vec<Decoration>,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct LayoutNode {
  pub id: String,
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
  pub side: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub direction: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct Point {
  pub x: f64,
  pub y: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct LayoutEdge {
  pub id: String,
  pub source: String,
  pub target: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub routing: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub waypoints: Option<Vec<Point>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub direction: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct Decoration {
  pub id: String,
  pub kind: String,
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
  #[serde(rename = "topicId", skip_serializing_if = "Option::is_none")]
  pub topic_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub direction: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Topic {
  pub id: String,
  pub children: Vec<String>,
  pub collapsed: bool,
  pub side: String,
  pub structure: Option<String>,
  pub offset_x: f64,
  pub offset_y: f64,
}

pub struct Document {
  pub root_id: String,
  pub topics: HashMap<String, Topic>,
  pub layout: String,
  pub floating_ids: Vec<String>,
  pub floating_positions: HashMap<String, Point>,
  pub groups: Vec<Summary>,
}

pub struct Summary {
  pub topic_ids: Vec<String>,
  pub summary_id: String,
}

#[derive(Clone)]
pub struct Unit {
  pub id: String,
  pub width: f64,
  pub height: f64,
  pub component_id: Option<String>,
}

#[derive(Clone)]
pub struct Placement {
  pub unit: Unit,
  pub x: f64,
  pub y: f64,
  pub direction: String,
}

#[derive(Default)]
pub struct LocalLayout {
  pub placements: Vec<Placement>,
  pub edges: Vec<LayoutEdge>,
  pub decorations: Vec<Decoration>,
}

#[derive(Clone, Copy, Default)]
pub struct Bounds {
  pub min_x: f64,
  pub min_y: f64,
  pub max_x: f64,
  pub max_y: f64,
}

pub fn bounds(layout: &LocalLayout) -> Bounds {
  let mut result = Bounds {
    min_x: f64::INFINITY,
    min_y: f64::INFINITY,
    max_x: f64::NEG_INFINITY,
    max_y: f64::NEG_INFINITY,
  };
  for item in &layout.placements {
    result.min_x = result.min_x.min(item.x - item.unit.width / 2.0);
    result.max_x = result.max_x.max(item.x + item.unit.width / 2.0);
    result.min_y = result.min_y.min(item.y - item.unit.height / 2.0);
    result.max_y = result.max_y.max(item.y + item.unit.height / 2.0);
  }
  for item in &layout.decorations {
    result.min_x = result.min_x.min(item.x);
    result.max_x = result.max_x.max(item.x + item.width);
    result.min_y = result.min_y.min(item.y);
    result.max_y = result.max_y.max(item.y + item.height);
  }
  if !result.min_x.is_finite() {
    Bounds::default()
  } else {
    result
  }
}

pub fn edge(source: &str, target: &str, direction: &str, routing: Option<&str>) -> LayoutEdge {
  LayoutEdge {
    id: format!("edge-{target}"),
    source: source.into(),
    target: target.into(),
    direction: Some(direction.into()),
    routing: routing.map(str::to_owned),
    waypoints: None,
  }
}

pub fn decoration(
  id: String,
  kind: &str,
  topic_id: &str,
  direction: Option<&str>,
  position: [f64; 2],
  size: [f64; 2],
) -> Decoration {
  let [x, y] = position;
  let [width, height] = size;
  Decoration {
    id,
    kind: kind.into(),
    topic_id: Some(topic_id.into()),
    direction: direction.map(str::to_owned),
    x,
    y,
    width,
    height,
  }
}

pub struct Plan {
  pub root_id: String,
  pub kind: String,
  pub ids: Vec<String>,
  pub children: HashMap<String, Vec<String>>,
  pub components: HashMap<String, String>,
}
