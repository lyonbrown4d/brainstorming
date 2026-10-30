mod compose;
mod document;
mod matrix;
mod model;
mod offsets;
mod structures;
mod tree;

pub use model::{Decoration, Layout, LayoutEdge, LayoutNode, NodeSize, Point};
use serde_json::Value;

/// Compute transient top-left positions from a validated document and measured card sizes.
pub fn compute(document: &Value, measurements: &[NodeSize]) -> Result<Layout, String> {
  let document = model::Document::parse(document)?;
  let default_map = document.layout == "map"
    && document.floating_ids.is_empty()
    && document.groups.is_empty()
    && !document
      .topics
      .values()
      .any(|topic| topic.structure.as_deref().is_some_and(|kind| kind != "map"));
  let mut layout = compose::structured(&document, measurements)?;
  if default_map {
    if let Some(index) = layout
      .nodes
      .iter()
      .position(|node| node.id == document.root_id)
    {
      let root = layout.nodes.remove(index);
      layout.nodes.insert(0, root);
    }
    for node in &mut layout.nodes {
      node.direction = None;
    }
    for edge in &mut layout.edges {
      edge.direction = None;
    }
  }
  offsets::manual(&document, &mut layout);
  offsets::summaries(&document, &mut layout);
  Ok(layout)
}
