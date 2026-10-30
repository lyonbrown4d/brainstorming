use super::{
  VisualGeometry, annotations, appearance, geometry,
  util::{self, Svg, field, fmt, path},
};
use crate::layout_engine::Layout;
use serde_json::Value;
use std::collections::HashMap;

pub(super) fn draw_ink(
  svg: &mut Svg,
  document: &Value,
  visual: Option<&VisualGeometry>,
) -> Result<(), String> {
  for stroke in document["drawings"].as_array().into_iter().flatten() {
    let id = field(stroke, "id");
    let geometry = visual
      .and_then(|item| item.drawing_paths.get(id))
      .ok_or("缺少共享手绘几何")?;
    svg.element(
      "path",
      &[
        ("d", path(geometry)?.into()),
        ("fill", util::color(field(stroke, "color"), "#242731")),
        ("data-drawing-id", id.into()),
      ],
    );
  }
  Ok(())
}

pub(super) fn draw_structures(
  svg: &mut Svg,
  document: &Value,
  layout: &Layout,
  appearances: &HashMap<String, appearance::TopicColor>,
  sketch: bool,
  visual: Option<&VisualGeometry>,
) -> Result<(), String> {
  for item in &layout.decorations {
    let colors = appearances
      .get(
        item
          .topic_id
          .as_deref()
          .unwrap_or(field(document, "rootId")),
      )
      .ok_or("结构配色缺失")?;
    let cell = item.kind == "cell";
    if cell && !sketch {
      svg.element(
        "rect",
        &[
          ("data-structure-kind", item.kind.clone()),
          ("x", fmt(item.x)),
          ("y", fmt(item.y)),
          ("width", fmt(item.width)),
          ("height", fmt(item.height)),
          ("fill", colors.stroke.clone()),
          ("fill-opacity", "0.035".into()),
          ("stroke", colors.stroke.clone()),
          ("stroke-width", "1".into()),
          ("stroke-opacity", "0.4".into()),
        ],
      );
      continue;
    }
    let d = if sketch {
      visual
        .and_then(|visual| visual.decoration_paths.get(&item.id))
        .ok_or("缺少共享结构素描几何")?
        .as_str()
    } else {
      ""
    };
    let owned = if !sketch {
      geometry::decoration(item)
    } else {
      String::new()
    };
    svg.element(
      "path",
      &[
        ("data-structure-kind", item.kind.clone()),
        ("d", path(if sketch { d } else { &owned })?.into()),
        (
          "fill",
          if cell {
            colors.stroke.clone()
          } else {
            "none".into()
          },
        ),
        ("stroke", colors.stroke.clone()),
        (
          "stroke-width",
          fmt(if cell || item.kind == "grid-line" {
            1.0
          } else {
            colors.line_width
          }),
        ),
        (
          "stroke-opacity",
          if cell || item.kind == "grid-line" {
            "0.4".into()
          } else {
            "1".into()
          },
        ),
      ],
    );
  }
  Ok(())
}

pub(super) fn draw_edges(
  svg: &mut Svg,
  document: &Value,
  layout: &Layout,
  appearances: &HashMap<String, appearance::TopicColor>,
  sketch: bool,
  visual: Option<&VisualGeometry>,
) -> Result<(), String> {
  let positions = layout
    .nodes
    .iter()
    .map(|node| (node.id.as_str(), node))
    .collect::<HashMap<_, _>>();
  for edge in &layout.edges {
    if edge.routing.as_deref() == Some("hidden") {
      continue;
    }
    let (Some(source), Some(target)) = (
      positions.get(edge.source.as_str()),
      positions.get(edge.target.as_str()),
    ) else {
      continue;
    };
    let topic = &document["topics"][&edge.target];
    let colors = appearances.get(&edge.target).ok_or("分支配色缺失")?;
    let owned = if sketch {
      String::new()
    } else {
      geometry::edge(
        edge,
        source,
        target,
        field(&topic["style"], "lineStyle") == "straight",
      )
    };
    let d = if sketch {
      visual
        .and_then(|item| item.edge_paths.get(&edge.id))
        .ok_or("缺少共享分支素描几何")?
        .as_str()
    } else {
      &owned
    };
    svg.element(
      "path",
      &[
        ("d", path(d)?.into()),
        ("fill", "none".into()),
        ("stroke", colors.stroke.clone()),
        ("stroke-width", fmt(colors.line_width)),
      ],
    );
  }
  Ok(())
}

pub(super) fn bounds(
  document: &Value,
  layout: &Layout,
  annotations: &[annotations::Annotation],
) -> Result<(f64, f64, f64, f64), String> {
  let mut left = f64::INFINITY;
  let mut top = f64::INFINITY;
  let mut right = f64::NEG_INFINITY;
  let mut bottom = f64::NEG_INFINITY;
  let mut add = |x: f64, y: f64, w: f64, h: f64| {
    left = left.min(x);
    top = top.min(y);
    right = right.max(x + w);
    bottom = bottom.max(y + h)
  };
  for node in &layout.nodes {
    add(node.x, node.y, node.width, node.height)
  }
  for item in &layout.decorations {
    add(item.x, item.y, item.width, item.height)
  }
  for edge in &layout.edges {
    for point in edge.waypoints.as_ref().into_iter().flatten() {
      add(point.x, point.y, 0.0, 0.0)
    }
  }
  for item in annotations {
    let caption = if matches!(item.kind.as_str(), "boundary" | "summary") && !item.lines.is_empty()
    {
      item.lines.len() as f64 * 18.0 + 8.0
    } else {
      0.0
    };
    let extended_width = if item.kind == "boundary" {
      item.width.max(240.0)
    } else if item.kind == "summary" && !item.lines.is_empty() {
      item.width
        + (item
          .lines
          .iter()
          .map(|line| line.chars().count())
          .sum::<usize>() as f64
          * 12.0)
          .min(240.0)
        + 24.0
    } else {
      item.width
    };
    add(
      item.x,
      item.y - caption,
      extended_width,
      item.height + caption,
    )
  }
  for stroke in document["drawings"].as_array().into_iter().flatten() {
    let width = util::number(stroke, "width", 1.0);
    let transform = &stroke["transform"];
    let sx = util::number(transform, "scaleX", 1.0);
    let sy = util::number(transform, "scaleY", 1.0);
    let tx = util::number(transform, "x", 0.0);
    let ty = util::number(transform, "y", 0.0);
    for point in stroke["points"].as_array().into_iter().flatten() {
      let x = util::number(point, "x", 0.0);
      let y = util::number(point, "y", 0.0);
      add(
        (x - width) * sx + tx,
        (y - width) * sy + ty,
        width * 2.0 * sx,
        width * 2.0 * sy,
      )
    }
  }
  if !left.is_finite() {
    return Err("画布没有可渲染内容".into());
  }
  let min_x = left - 48.0;
  let min_y = top - 48.0;
  Ok((
    min_x,
    min_y,
    (right - min_x + 48.0).ceil(),
    (bottom - min_y + 48.0).ceil(),
  ))
}
