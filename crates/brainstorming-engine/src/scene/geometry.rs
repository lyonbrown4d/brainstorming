use super::util::fmt;
use crate::layout_engine::{Decoration, LayoutEdge, LayoutNode};

pub fn edge(edge: &LayoutEdge, source: &LayoutNode, target: &LayoutNode, straight: bool) -> String {
  if edge.routing.as_deref() == Some("hidden") {
    return String::new();
  }
  if let Some(points) = &edge.waypoints
    && !points.is_empty()
  {
    return points
      .iter()
      .enumerate()
      .map(|(i, p)| {
        format!(
          "{} {} {}",
          if i == 0 { "M" } else { "L" },
          fmt(p.x),
          fmt(p.y)
        )
      })
      .collect::<Vec<_>>()
      .join(" ");
  }
  let dx = target.x + target.width / 2.0 - source.x - source.width / 2.0;
  let dy = target.y + target.height / 2.0 - source.y - source.height / 2.0;
  let horizontal = edge
    .direction
    .as_deref()
    .map(|dir| matches!(dir, "left" | "right"))
    .unwrap_or(dx.abs() >= dy.abs());
  let left = edge
    .direction
    .as_deref()
    .map(|dir| dir == "left")
    .unwrap_or(dx < 0.0);
  let up = edge
    .direction
    .as_deref()
    .map(|dir| dir == "up")
    .unwrap_or(dy < 0.0);
  let x1 = source.x
    + if horizontal {
      if left { 0.0 } else { source.width }
    } else {
      source.width / 2.0
    };
  let y1 = source.y
    + if horizontal {
      source.height / 2.0
    } else if up {
      0.0
    } else {
      source.height
    };
  let x2 = target.x
    + if horizontal {
      if left { target.width } else { 0.0 }
    } else {
      target.width / 2.0
    };
  let y2 = target.y
    + if horizontal {
      target.height / 2.0
    } else if up {
      target.height
    } else {
      0.0
    };
  if straight || edge.routing.as_deref() == Some("straight") {
    return format!("M {} {} L {} {}", fmt(x1), fmt(y1), fmt(x2), fmt(y2));
  }
  let mx = (x1 + x2) / 2.0;
  let my = (y1 + y2) / 2.0;
  if edge.routing.as_deref() == Some("orthogonal") {
    if horizontal {
      return format!(
        "M {} {} H {} V {} H {}",
        fmt(x1),
        fmt(y1),
        fmt(mx),
        fmt(y2),
        fmt(x2)
      );
    } else {
      return format!(
        "M {} {} V {} H {} V {}",
        fmt(x1),
        fmt(y1),
        fmt(my),
        fmt(x2),
        fmt(y2)
      );
    }
  }
  if horizontal {
    format!(
      "M {} {} C {} {}, {} {}, {} {}",
      fmt(x1),
      fmt(y1),
      fmt(mx),
      fmt(y1),
      fmt(mx),
      fmt(y2),
      fmt(x2),
      fmt(y2)
    )
  } else {
    format!(
      "M {} {} C {} {}, {} {}, {} {}",
      fmt(x1),
      fmt(y1),
      fmt(x1),
      fmt(my),
      fmt(x2),
      fmt(my),
      fmt(x2),
      fmt(y2)
    )
  }
}

pub fn decoration(item: &Decoration) -> String {
  let x = item.x;
  let y = item.y;
  let width = item.width;
  let height = item.height;
  if matches!(item.kind.as_str(), "spine" | "grid-line") {
    return format!(
      "M {} {} L {} {}",
      fmt(x),
      fmt(y),
      fmt(x + width),
      fmt(y + height)
    );
  }
  if item.kind == "cell" {
    return format!(
      "M{} {} H{} V{} H{} Z",
      fmt(x),
      fmt(y),
      fmt(x + width),
      fmt(y + height),
      fmt(x)
    );
  }
  let outer = if item.direction.as_deref() == Some("left") {
    x + width
  } else {
    x
  };
  let inner = if item.direction.as_deref() == Some("left") {
    x
  } else {
    x + width
  };
  let middle = (outer + inner) / 2.0;
  let center = y + height / 2.0;
  let bend = (height / 4.0).min(width / 2.0);
  format!(
    "M {} {} Q {} {} {} {} L {} {} Q {} {} {} {} Q {} {} {} {} L {} {} Q {} {} {} {}",
    fmt(inner),
    fmt(y),
    fmt(middle),
    fmt(y),
    fmt(middle),
    fmt(y + bend),
    fmt(middle),
    fmt(center - bend),
    fmt(middle),
    fmt(center),
    fmt(outer),
    fmt(center),
    fmt(middle),
    fmt(center),
    fmt(middle),
    fmt(center + bend),
    fmt(middle),
    fmt(y + height - bend),
    fmt(middle),
    fmt(y + height),
    fmt(inner),
    fmt(y + height)
  )
}
