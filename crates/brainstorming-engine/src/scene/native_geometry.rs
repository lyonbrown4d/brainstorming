use super::{
  VisualGeometry, appearance, geometry, shapes,
  util::{field, number},
};
use brainstorming_geometry::{sketch_path, stroke_path};
use serde_json::Value;

/// Canonical persisted-document geometry, reused by desktop and CLI exports.
pub fn prepare(
  document: &Value,
  layout: &crate::layout_engine::Layout,
  measurements: Vec<crate::layout_engine::NodeSize>,
) -> Result<VisualGeometry, String> {
  let mut result = VisualGeometry {
    measurements,
    ..Default::default()
  };
  if field(&document["settings"], "visualStyle") == "sketch" {
    let root = field(document, "rootId");
    let branches = document["topics"][root]["children"].as_array();
    for node in &layout.nodes {
      let topic = &document["topics"][&node.id];
      let shape = topic["style"]["shape"].as_str().unwrap_or("rounded");
      if shape == "text" {
        continue;
      }
      let scale = number(&topic["style"], "scale", 1.0);
      let (width, height) = (node.width / scale, node.height / scale);
      let path = shapes::shape_path(shape, width, height);
      let identity = format!("topic:{}", node.id);
      result
        .topic_outlines
        .insert(node.id.clone(), sketch_path(&path, &identity, false));
      if node.id == root
        || branches.is_some_and(|ids| ids.iter().any(|id| id == &node.id))
        || topic["style"].get("fill").is_some()
        || shape == "sticky"
      {
        result.topic_fills.insert(
          node.id.clone(),
          sketch_path(&path, &format!("fill:{identity}"), true),
        );
      }
      let accent = match shape {
        "sticky" => Some((
          "fold",
          format!("M{} {} V{} H{}", width * 0.84, height, height * 0.84, width),
        )),
        "card" => Some((
          "header",
          format!("M{} {} H{}", width * 0.08, height * 0.12, width * 0.92),
        )),
        _ => None,
      };
      if let Some((suffix, path)) = accent {
        result.topic_accents.insert(
          format!("{}:{suffix}", node.id),
          sketch_path(&path, &format!("{identity}:{suffix}"), false),
        );
      }
    }
    let positions = layout
      .nodes
      .iter()
      .map(|node| (node.id.as_str(), node))
      .collect::<std::collections::HashMap<_, _>>();
    for edge in &layout.edges {
      let source = positions.get(edge.source.as_str()).copied();
      let target = positions.get(edge.target.as_str()).copied();
      if let (Some(source), Some(target)) = (source, target) {
        let straight = field(&document["topics"][&edge.target]["style"], "lineStyle") == "straight";
        result.edge_paths.insert(
          edge.id.clone(),
          sketch_path(
            &geometry::edge(edge, source, target, straight),
            &format!("edge:{}", edge.id),
            false,
          ),
        );
      }
    }
    for item in &layout.decorations {
      result.decoration_paths.insert(
        item.id.clone(),
        sketch_path(
          &geometry::decoration(item),
          &format!("decoration:{}", item.id),
          false,
        ),
      );
    }
  }
  for stroke in document["drawings"].as_array().into_iter().flatten() {
    let points = stroke["points"]
      .as_array()
      .into_iter()
      .flatten()
      .map(|p| {
        [
          number(p, "x", 0.0),
          number(p, "y", 0.0),
          number(p, "pressure", 0.5),
        ]
      })
      .collect::<Vec<_>>();
    let t = &stroke["transform"];
    result.drawing_paths.insert(
      field(stroke, "id").to_owned(),
      stroke_path(
        &points,
        number(stroke, "width", 1.0),
        [
          number(t, "x", 0.0),
          number(t, "y", 0.0),
          number(t, "scaleX", 1.0),
          number(t, "scaleY", 1.0),
        ],
      ),
    );
  }
  let palette = appearance::palette(document);
  let colors = appearance::all(document, &palette);
  for node in &layout.nodes {
    let markers = document["topics"][&node.id]["metadata"]["markers"].as_array();
    if let Some(markers) = markers.filter(|markers| !markers.is_empty()) {
      let color = &colors.get(&node.id).ok_or("主题配色缺失")?.text;
      let size = number(
        &document["topics"][&node.id]["metadata"]["markerStyle"],
        "size",
        16.0,
      );
      result.marker_icons.insert(
        node.id.clone(),
        markers
          .iter()
          .take(4)
          .map(|marker| {
            brainstorming_geometry::marker_markup(
              marker.as_str().unwrap_or("question"),
              color,
              size,
            )
          })
          .collect(),
      );
    }
  }
  Ok(result)
}
