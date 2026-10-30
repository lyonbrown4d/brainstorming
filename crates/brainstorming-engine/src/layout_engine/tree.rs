use super::model::{LocalLayout, Placement, Plan, Unit, edge};
use d3_hierarchy::{hierarchy_with, node::Tree, tree::Tidy};
use serde_json::{Value, json};
use std::collections::HashMap;

pub fn hierarchy(plan: &Plan, root_id: &str, first: Option<&[String]>) -> Tree {
  let root = json!({ "id": root_id });
  hierarchy_with(&root, &|value: &Value| {
    let id = value.get("id")?.as_str()?;
    let children = if id == root_id {
      first.or_else(|| plan.children.get(id).map(Vec::as_slice))
    } else {
      plan.children.get(id).map(Vec::as_slice)
    }?;
    Some(
      children
        .iter()
        .map(|child| json!({ "id": child }))
        .collect(),
    )
  })
}

pub fn tree_layout(
  plan: &Plan,
  units: &HashMap<String, Unit>,
  direction: &str,
  root_id: &str,
  first: Option<&[String]>,
) -> LocalLayout {
  let vertical = matches!(direction, "down" | "up");
  let widths: HashMap<_, _> = units
    .iter()
    .map(|(id, unit)| (id.clone(), if vertical { unit.width } else { unit.height }))
    .collect();
  let mut tree = hierarchy(plan, root_id, first);
  Tidy::new()
    .node_size([1.0, 1.0])
    .separation(move |tree, a, b| {
      let a_id = tree.nodes[a].data["id"].as_str().unwrap_or("");
      let b_id = tree.nodes[b].data["id"].as_str().unwrap_or("");
      (widths[a_id] + widths[b_id]) / 2.0 + 24.0
    })
    .tree(&mut tree);
  let order = tree.order_before(tree.root);
  let mut maximums = Vec::<f64>::new();
  for &index in &order {
    let node = &tree.nodes[index];
    let id = node.data["id"].as_str().unwrap_or("");
    if maximums.len() <= node.depth {
      maximums.resize(node.depth + 1, 0.0);
    }
    let unit = &units[id];
    maximums[node.depth] =
      maximums[node.depth].max(if vertical { unit.height } else { unit.width });
  }
  let mut offsets = vec![0.0; maximums.len()];
  for depth in 1..maximums.len() {
    offsets[depth] = offsets[depth - 1] + maximums[depth - 1] / 2.0 + 72.0 + maximums[depth] / 2.0;
  }
  let sign = if matches!(direction, "left" | "up") {
    -1.0
  } else {
    1.0
  };
  let mut result = LocalLayout::default();
  for index in order {
    let node = &tree.nodes[index];
    let id = node.data["id"].as_str().unwrap_or("");
    let depth = offsets[node.depth] * sign;
    result.placements.push(Placement {
      unit: units[id].clone(),
      x: if vertical { node.x } else { depth },
      y: if vertical { depth } else { node.x },
      direction: direction.into(),
    });
    if let Some(parent) = node.parent {
      let parent_id = tree.nodes[parent].data["id"].as_str().unwrap_or("");
      result.edges.push(edge(
        parent_id,
        id,
        direction,
        if vertical { Some("orthogonal") } else { None },
      ));
    }
  }
  result
}

pub fn map_layout(
  plan: &Plan,
  units: &HashMap<String, Unit>,
  sides: &HashMap<String, String>,
) -> LocalLayout {
  let children = plan
    .children
    .get(&plan.root_id)
    .map(Vec::as_slice)
    .unwrap_or(&[]);
  let mut result = LocalLayout::default();
  for direction in ["left", "right"] {
    let ids: Vec<_> = children
      .iter()
      .filter(|id| sides.get(*id).map(String::as_str) == Some(direction))
      .cloned()
      .collect();
    let mut branch = tree_layout(plan, units, direction, &plan.root_id, Some(&ids));
    if direction == "left" {
      branch
        .placements
        .retain(|item| item.unit.id != plan.root_id);
    }
    result.placements.extend(branch.placements);
    result.edges.extend(branch.edges);
  }
  result
}
