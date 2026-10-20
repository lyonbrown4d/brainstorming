use super::model::{LocalLayout, Placement, Plan, Point, Unit, bounds, decoration, edge};
use super::tree::{hierarchy, tree_layout};
use d3_hierarchy::partition::Partition;
use std::collections::HashMap;

pub fn aligned_tree(plan: &Plan, units: &HashMap<String, Unit>, direction: &str) -> LocalLayout {
  let mut order = Vec::new();
  let mut stack = vec![(plan.root_id.clone(), 0usize)];
  while let Some((id, depth)) = stack.pop() {
    order.push((id.clone(), depth));
    for child in plan.children.get(&id).into_iter().flatten().rev() {
      stack.push((child.clone(), depth + 1));
    }
  }
  let mut widths = HashMap::<String, f64>::new();
  let mut heights = Vec::<f64>::new();
  for (id, depth) in order.iter().rev() {
    let children = plan.children.get(id).map(Vec::as_slice).unwrap_or(&[]);
    let span: f64 = children.iter().map(|child| widths[child]).sum::<f64>()
      + children.len().saturating_sub(1) as f64 * 24.0;
    widths.insert(id.clone(), units[id].width.max(span));
    if heights.len() <= *depth {
      heights.resize(depth + 1, 0.0);
    }
    heights[*depth] = heights[*depth].max(units[id].height);
  }
  let mut depths = vec![0.0; heights.len()];
  for depth in 1..heights.len() {
    depths[depth] = depths[depth - 1] + heights[depth - 1] / 2.0 + 64.0 + heights[depth] / 2.0;
  }
  let mut starts = HashMap::from([(plan.root_id.clone(), -units[&plan.root_id].width / 2.0)]);
  let mut result = LocalLayout::default();
  for (id, depth) in order {
    let unit = &units[&id];
    let start = starts[&id];
    result.placements.push(Placement {
      unit: unit.clone(),
      x: start + unit.width / 2.0,
      y: depths[depth] * if direction == "up" { -1.0 } else { 1.0 },
      direction: direction.into(),
    });
    let mut cursor = start;
    for child in plan.children.get(&id).into_iter().flatten() {
      starts.insert(child.clone(), cursor);
      cursor += widths[child] + 24.0;
      result
        .edges
        .push(edge(&id, child, direction, Some("orthogonal")));
    }
  }
  result
}

pub fn brace(plan: &Plan, units: &HashMap<String, Unit>, direction: &str) -> LocalLayout {
  let mut result = tree_layout(plan, units, direction, &plan.root_id, None);
  let positions: HashMap<_, _> = result
    .placements
    .iter()
    .map(|item| (item.unit.id.as_str(), item))
    .collect();
  for parent in &result.placements {
    let children: Vec<_> = plan
      .children
      .get(&parent.unit.id)
      .into_iter()
      .flatten()
      .filter_map(|id| positions.get(id.as_str()).copied())
      .collect();
    if children.is_empty() {
      continue;
    }
    let top = children
      .iter()
      .map(|item| item.y - item.unit.height / 2.0)
      .fold(f64::INFINITY, f64::min);
    let bottom = children
      .iter()
      .map(|item| item.y + item.unit.height / 2.0)
      .fold(f64::NEG_INFINITY, f64::max);
    let inner = if direction == "right" {
      children
        .iter()
        .map(|item| item.x - item.unit.width / 2.0)
        .fold(f64::INFINITY, f64::min)
    } else {
      children
        .iter()
        .map(|item| item.x + item.unit.width / 2.0)
        .fold(f64::NEG_INFINITY, f64::max)
    };
    result.decorations.push(decoration(
      format!("brace-{}", parent.unit.id),
      "brace",
      &parent.unit.id,
      Some(direction),
      [inner + if direction == "right" { -48.0 } else { 16.0 }, top],
      [32.0, bottom - top],
    ));
  }
  for edge in &mut result.edges {
    edge.routing = Some("hidden".into());
  }
  result
}

pub fn spine(plan: &Plan, units: &HashMap<String, Unit>, kind: &str) -> LocalLayout {
  let root = &units[&plan.root_id];
  let vertical = kind == "timeline-vertical";
  let fishbone = kind == "fishbone";
  let mut result = LocalLayout::default();
  result.placements.push(Placement {
    unit: root.clone(),
    x: 0.0,
    y: 0.0,
    direction: if vertical { "down" } else { "right" }.into(),
  });
  let mut cursor = (if vertical { root.height } else { root.width }) / 2.0 + 72.0;
  let mut end = cursor;
  for (index, id) in plan
    .children
    .get(&root.id)
    .into_iter()
    .flatten()
    .enumerate()
  {
    let direction = if vertical {
      "right"
    } else if fishbone && index % 2 == 0 {
      "up"
    } else {
      "down"
    };
    let branch = tree_layout(plan, units, direction, id, None);
    let rect = bounds(&branch);
    let child = &units[id];
    let offset_x = if vertical { 0.0 } else { cursor - rect.min_x };
    let offset_y = if vertical {
      cursor - rect.min_y
    } else if fishbone {
      (root.height / 2.0 + 88.0 + child.height / 2.0) * if direction == "up" { -1.0 } else { 1.0 }
    } else {
      0.0
    };
    result
      .placements
      .extend(branch.placements.into_iter().map(|mut item| {
        item.x += offset_x;
        item.y += offset_y;
        item
      }));
    let mut rib = edge(
      &root.id,
      id,
      if vertical {
        "down"
      } else if fishbone {
        direction
      } else {
        "right"
      },
      Some(if fishbone { "straight" } else { "hidden" }),
    );
    if fishbone {
      rib.waypoints = Some(vec![
        Point {
          x: offset_x + child.width / 2.0 + 56.0,
          y: 0.0,
        },
        Point {
          x: offset_x,
          y: offset_y
            + if direction == "up" {
              child.height / 2.0
            } else {
              -child.height / 2.0
            },
        },
      ]);
    }
    result.edges.push(rib);
    result
      .edges
      .extend(branch.edges.into_iter().map(|mut item| {
        item.routing = Some("orthogonal".into());
        item
      }));
    end = if vertical {
      offset_y + child.height / 2.0
    } else {
      offset_x + child.width / 2.0 + if fishbone { 56.0 } else { 0.0 }
    };
    cursor += (if vertical {
      rect.max_y - rect.min_y
    } else {
      rect.max_x - rect.min_x
    }) + 96.0;
  }
  if result.placements.len() > 1 {
    result.decorations.push(decoration(
      format!("spine-{}", root.id),
      "spine",
      &root.id,
      Some(if vertical { "down" } else { "right" }),
      [
        if vertical { 0.0 } else { root.width / 2.0 },
        if vertical { root.height / 2.0 } else { 0.0 },
      ],
      [
        if vertical {
          0.0
        } else {
          end - root.width / 2.0
        },
        if vertical {
          end - root.height / 2.0
        } else {
          0.0
        },
      ],
    ));
  }
  result
}

pub fn table(plan: &Plan, units: &HashMap<String, Unit>, direction: &str) -> LocalLayout {
  let vertical = direction == "down";
  let mut tree = hierarchy(plan, &plan.root_id, None);
  tree.sum(|datum| {
    let id = datum["id"].as_str().unwrap_or("");
    if plan.children.get(id).is_some_and(|items| !items.is_empty()) {
      0.0
    } else {
      1.0
    }
  });
  Partition::new().size([1.0, 1.0]).partition(&mut tree);
  let order = tree.order_before(tree.root);
  let mut depths = Vec::<f64>::new();
  let mut breadth: f64 = 0.0;
  for &index in &order {
    let node = &tree.nodes[index];
    let id = node.data["id"].as_str().unwrap_or("");
    let unit = &units[id];
    breadth =
      breadth.max(((if vertical { unit.width } else { unit.height }) + 32.0) / (node.x1 - node.x0));
    if depths.len() <= node.depth {
      depths.resize(node.depth + 1, 0.0);
    }
    depths[node.depth] =
      depths[node.depth].max((if vertical { unit.height } else { unit.width }) + 32.0);
  }
  let mut starts = vec![-depths[0] / 2.0];
  for depth in 1..depths.len() {
    starts.push(starts[depth - 1] + depths[depth - 1]);
  }
  let mut result = LocalLayout::default();
  for index in order {
    let node = &tree.nodes[index];
    let id = node.data["id"].as_str().unwrap_or("");
    let cross_start = (node.x0 - 0.5) * breadth;
    let cross_size = (node.x1 - node.x0) * breadth;
    let depth_start = starts[node.depth];
    let depth_size = depths[node.depth];
    result.placements.push(Placement {
      unit: units[id].clone(),
      direction: direction.into(),
      x: if vertical {
        cross_start + cross_size / 2.0
      } else {
        depth_start + depth_size / 2.0
      },
      y: if vertical {
        depth_start + depth_size / 2.0
      } else {
        cross_start + cross_size / 2.0
      },
    });
    result.decorations.push(decoration(
      format!("cell-{id}"),
      "cell",
      id,
      Some(direction),
      [
        if vertical { cross_start } else { depth_start },
        if vertical { depth_start } else { cross_start },
      ],
      [
        if vertical { cross_size } else { depth_size },
        if vertical { depth_size } else { cross_size },
      ],
    ));
    if let Some(parent) = node.parent {
      let parent_id = tree.nodes[parent].data["id"].as_str().unwrap_or("");
      result
        .edges
        .push(edge(parent_id, id, direction, Some("hidden")));
    }
  }
  result
}
