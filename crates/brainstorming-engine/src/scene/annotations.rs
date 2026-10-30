use super::relation_geometry::relation_route;
use super::util::{self, field, number};
use crate::layout_engine::Layout;
use serde_json::Value;
use std::collections::HashMap;

pub struct Annotation {
  pub kind: String,
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
  pub color: String,
  pub lines: Vec<String>,
  pub path: String,
  pub arrow: String,
  pub dashed: bool,
  pub line_width: f64,
}

pub fn collect(document: &Value, layout: &Layout) -> Vec<Annotation> {
  let positions = layout
    .nodes
    .iter()
    .map(|node| (node.id.as_str(), node))
    .collect::<HashMap<_, _>>();
  let mut out = Vec::new();
  for group in document["groups"].as_array().into_iter().flatten() {
    let nodes = group["topicIds"]
      .as_array()
      .into_iter()
      .flatten()
      .filter_map(Value::as_str)
      .filter_map(|id| positions.get(id).copied())
      .collect::<Vec<_>>();
    if nodes.is_empty() {
      continue;
    }
    let left = nodes
      .iter()
      .map(|node| node.x)
      .fold(f64::INFINITY, f64::min);
    let top = nodes
      .iter()
      .map(|node| node.y)
      .fold(f64::INFINITY, f64::min);
    let right = nodes
      .iter()
      .map(|node| node.x + node.width)
      .fold(f64::NEG_INFINITY, f64::max);
    let bottom = nodes
      .iter()
      .map(|node| node.y + node.height)
      .fold(f64::NEG_INFINITY, f64::max);
    let kind = field(group, "kind");
    let summary = field(group, "summaryTopicId");
    let title = if summary.is_empty() {
      field(group, "title")
    } else {
      field(&document["topics"][summary], "title")
    };
    let fallback = if kind == "summary" {
      "概要"
    } else {
      "边界"
    };
    let lines = if summary.is_empty() {
      wrap(if title.is_empty() { fallback } else { title }, 20)
    } else {
      Vec::new()
    };
    let width = right - left + 32.0;
    let x = left - 16.0;
    let y = top - 26.0;
    out.push(Annotation {
      kind: kind.into(),
      x,
      y,
      width,
      height: bottom - top + 42.0,
      color: util::color(field(group, "color"), "#8b79d9"),
      lines,
      path: String::new(),
      arrow: String::new(),
      dashed: false,
      line_width: 2.0,
    });
  }
  for relation in document["relations"].as_array().into_iter().flatten() {
    let (Some(from), Some(to)) = (
      positions.get(field(relation, "from")),
      positions.get(field(relation, "to")),
    ) else {
      continue;
    };
    let route = relation_route(relation, from, to);
    let color = util::color(field(relation, "color"), "#8b79d9");
    let title = field(relation, "title");
    let lines = wrap(
      if title.trim().is_empty() {
        "关联"
      } else {
        title
      },
      18,
    );
    let label_width = (lines
      .iter()
      .map(|line| line.chars().count())
      .max()
      .unwrap_or(0) as f64
      * 12.0)
      .max(32.0)
      + 16.0;
    let label_height = lines.len() as f64 * 18.0 + 8.0;
    out.push(Annotation {
      kind: "relation-path".into(),
      x: route.1.0,
      y: route.1.1,
      width: route.1.2,
      height: route.1.3,
      color: color.clone(),
      lines: Vec::new(),
      path: route.0,
      arrow: field(relation, "arrow").into(),
      dashed: relation["dashed"] == true,
      line_width: number(relation, "width", 2.0),
    });
    out.push(Annotation {
      kind: "relation-label".into(),
      x: route.2.0 - label_width / 2.0,
      y: route.2.1 - label_height / 2.0,
      width: label_width,
      height: label_height,
      color,
      lines,
      path: String::new(),
      arrow: String::new(),
      dashed: false,
      line_width: 2.0,
    });
  }
  for callout in document["callouts"].as_array().into_iter().flatten() {
    let Some(node) = positions.get(field(callout, "topicId")) else {
      continue;
    };
    let title = field(callout, "text");
    let lines = wrap(title, 14);
    out.push(Annotation {
      kind: "callout".into(),
      x: node.x + node.width + 14.0,
      y: node.y - 16.0,
      width: 192.0,
      height: lines.len() as f64 * 18.0 + 16.0,
      color: "#92400e".into(),
      lines,
      path: String::new(),
      arrow: String::new(),
      dashed: false,
      line_width: 1.0,
    });
  }
  out
}

fn wrap(text: &str, columns: usize) -> Vec<String> {
  text
    .split('\n')
    .flat_map(|line| {
      let chars = line.chars().collect::<Vec<_>>();
      if chars.is_empty() {
        vec![String::new()]
      } else {
        chars
          .chunks(columns)
          .map(|part| part.iter().collect::<String>())
          .collect()
      }
    })
    .collect()
}
