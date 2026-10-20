use super::util::{field, fmt, number};
use crate::layout_engine::LayoutNode;
use serde_json::Value;

fn anchor(box_: &LayoutNode, side: &str) -> (f64, f64) {
  (
    box_.x
      + if side == "left" {
        0.0
      } else if side == "right" {
        box_.width
      } else {
        box_.width / 2.0
      },
    box_.y
      + if side == "top" {
        0.0
      } else if side == "bottom" {
        box_.height
      } else {
        box_.height / 2.0
      },
  )
}
fn default_anchors(from: &LayoutNode, to: &LayoutNode) -> (&'static str, &'static str) {
  let dx = to.x + to.width / 2.0 - from.x - from.width / 2.0;
  let dy = to.y + to.height / 2.0 - from.y - from.height / 2.0;
  if dy.abs() > dx.abs() {
    if dy > 0.0 {
      ("bottom", "top")
    } else {
      ("top", "bottom")
    }
  } else if dx > 0.0 {
    ("right", "left")
  } else {
    ("left", "right")
  }
}
fn control(point: (f64, f64), other: (f64, f64), side: &str) -> (f64, f64) {
  let horizontal = matches!(side, "left" | "right");
  let sign = if matches!(side, "left" | "top") {
    -1.0
  } else {
    1.0
  };
  let distance = (if horizontal {
    other.0 - point.0
  } else {
    other.1 - point.1
  }) * sign;
  let reach = if distance >= 0.0 {
    distance * 0.5
  } else {
    6.25 * (-distance).sqrt()
  };
  (
    point.0 + if horizontal { sign * reach } else { 0.0 },
    point.1 + if horizontal { 0.0 } else { sign * reach },
  )
}
pub(super) fn relation_route(
  relation: &Value,
  from: &LayoutNode,
  to: &LayoutNode,
) -> (String, (f64, f64, f64, f64), (f64, f64)) {
  let defaults = default_anchors(from, to);
  let source = relation["sourceAnchor"].as_str().unwrap_or(defaults.0);
  let target = relation["targetAnchor"].as_str().unwrap_or(defaults.1);
  let start = anchor(from, source);
  let end = anchor(to, target);
  let midpoint = ((start.0 + end.0) / 2.0, (start.1 + end.1) / 2.0);
  let mut points = vec![start, end];
  let route = field(relation, "routing");
  let mut center = midpoint;
  let path = if route == "straight" {
    format!(
      "M {} {} L {} {}",
      fmt(start.0),
      fmt(start.1),
      fmt(end.0),
      fmt(end.1)
    )
  } else if route == "orthogonal" {
    let waypoints = relation["waypoints"]
      .as_array()
      .map(|items| {
        items
          .iter()
          .map(|p| {
            (
              midpoint.0 + number(p, "x", 0.0),
              midpoint.1 + number(p, "y", 0.0),
            )
          })
          .collect::<Vec<_>>()
      })
      .unwrap_or_else(|| vec![midpoint]);
    let mut vertices = vec![start];
    for (index, p) in waypoints.iter().enumerate() {
      let prev = *vertices.last().unwrap();
      let vertical = index == 0 && matches!(source, "top" | "bottom");
      vertices.push(if vertical {
        (prev.0, p.1)
      } else {
        (p.0, prev.1)
      });
      vertices.push(*p)
    }
    let prev = *vertices.last().unwrap();
    vertices.push(if matches!(target, "left" | "right") {
      (prev.0, end.1)
    } else {
      (end.0, prev.1)
    });
    vertices.push(end);
    center = *waypoints.get(waypoints.len() / 2).unwrap_or(&midpoint);
    points.extend(vertices.iter().copied());
    format!(
      "M {}",
      vertices
        .iter()
        .map(|p| format!("{} {}", fmt(p.0), fmt(p.1)))
        .collect::<Vec<_>>()
        .join(" L ")
    )
  } else {
    let controls = relation["controlPoints"]
      .as_array()
      .filter(|items| items.len() >= 2)
      .map(|items| {
        items
          .iter()
          .take(2)
          .map(|p| {
            (
              midpoint.0 + number(p, "x", 0.0),
              midpoint.1 + number(p, "y", 0.0),
            )
          })
          .collect::<Vec<_>>()
      })
      .unwrap_or_else(|| vec![control(start, end, source), control(end, start, target)]);
    points.extend(controls.iter().copied());
    center = (
      (start.0 + 3.0 * controls[0].0 + 3.0 * controls[1].0 + end.0) / 8.0,
      (start.1 + 3.0 * controls[0].1 + 3.0 * controls[1].1 + end.1) / 8.0,
    );
    format!(
      "M {} {} C {} {}, {} {}, {} {}",
      fmt(start.0),
      fmt(start.1),
      fmt(controls[0].0),
      fmt(controls[0].1),
      fmt(controls[1].0),
      fmt(controls[1].1),
      fmt(end.0),
      fmt(end.1)
    )
  };
  let padding = number(relation, "width", 2.0) * 6.0 + 4.0;
  let left = points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min) - padding;
  let top = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min) - padding;
  let right = points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max) + padding;
  let bottom = points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max) + padding;
  let offset = &relation["labelOffset"];
  (
    path,
    (left, top, right - left, bottom - top),
    (
      center.0 + number(offset, "x", 0.0),
      center.1 + number(offset, "y", -28.0),
    ),
  )
}
