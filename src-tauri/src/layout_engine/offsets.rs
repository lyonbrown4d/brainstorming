use super::model::{Document, Layout, Point};
use std::collections::{HashMap, HashSet};

pub fn manual(document: &Document, layout: &mut Layout) {
  if !document
    .topics
    .values()
    .any(|topic| topic.offset_x != 0.0 || topic.offset_y != 0.0)
  {
    return;
  }
  let mut parents = HashMap::<String, String>::new();
  for topic in document.topics.values() {
    for child in &topic.children {
      parents.insert(child.clone(), topic.id.clone());
    }
  }
  let floating: HashSet<_> = document.floating_ids.iter().collect();
  let mut offsets = HashMap::<String, Point>::new();
  let offset = |id: &str, offsets: &mut HashMap<String, Point>| -> Point {
    let mut chain = Vec::new();
    let mut current = Some(id.to_owned());
    while let Some(key) = current.as_ref() {
      if offsets.contains_key(key) {
        break;
      }
      chain.push(key.clone());
      current = if floating.contains(key) {
        None
      } else {
        parents.get(key).cloned()
      };
    }
    let mut value = current
      .and_then(|key| offsets.get(&key).cloned())
      .unwrap_or(Point { x: 0.0, y: 0.0 });
    for key in chain.into_iter().rev() {
      if let Some(topic) = document.topics.get(&key) {
        value.x += topic.offset_x;
        value.y += topic.offset_y;
      }
      offsets.insert(key, value.clone());
    }
    value
  };
  for node in &mut layout.nodes {
    let delta = offset(&node.id, &mut offsets);
    node.x += delta.x;
    node.y += delta.y;
  }
  for item in &mut layout.edges {
    let Some(points) = &mut item.waypoints else {
      continue;
    };
    let start = offset(&item.source, &mut offsets);
    let end = offset(&item.target, &mut offsets);
    let count = points.len();
    for (index, point) in points.iter_mut().enumerate() {
      let t = if count > 1 {
        index as f64 / (count - 1) as f64
      } else {
        0.0
      };
      point.x += start.x * (1.0 - t) + end.x * t;
      point.y += start.y * (1.0 - t) + end.y * t;
    }
  }
  for item in &mut layout.decorations {
    let delta = offset(
      item.topic_id.as_deref().unwrap_or(&document.root_id),
      &mut offsets,
    );
    item.x += delta.x;
    item.y += delta.y;
  }
}

fn subtree_ids(document: &Document, root_id: &str) -> HashSet<String> {
  let mut ids = HashSet::new();
  let mut pending = vec![root_id.to_owned()];
  while let Some(id) = pending.pop() {
    if !ids.insert(id.clone()) {
      continue;
    }
    if let Some(topic) = document.topics.get(&id) {
      pending.extend(topic.children.iter().cloned());
    }
  }
  ids
}

fn depths(document: &Document) -> HashMap<String, usize> {
  let mut result = HashMap::new();
  let mut pending = vec![(document.root_id.clone(), 0usize)];
  while let Some((id, depth)) = pending.pop() {
    result.insert(id.clone(), depth);
    if let Some(topic) = document.topics.get(&id) {
      for child in &topic.children {
        pending.push((child.clone(), depth + 1));
      }
    }
  }
  result
}

pub fn summaries(document: &Document, layout: &mut Layout) {
  if document.groups.is_empty() {
    return;
  }
  let depth = depths(document);
  let mut groups: Vec<_> = document.groups.iter().collect();
  groups.sort_by_key(|group| depth.get(&group.summary_id).copied().unwrap_or(0));
  let mut hidden = HashSet::<String>::new();
  for group in groups {
    let subtree = subtree_ids(document, &group.summary_id);
    let sources: Vec<_> = group
      .topic_ids
      .iter()
      .filter(|id| !hidden.contains(*id))
      .filter_map(|id| layout.nodes.iter().find(|node| &node.id == id))
      .collect();
    if sources.is_empty() {
      hidden.extend(subtree);
      continue;
    }
    let left = sources
      .iter()
      .map(|node| node.x)
      .fold(f64::INFINITY, f64::min);
    let right = sources
      .iter()
      .map(|node| node.x + node.width)
      .fold(f64::NEG_INFINITY, f64::max);
    let top = sources
      .iter()
      .map(|node| node.y)
      .fold(f64::INFINITY, f64::min);
    let bottom = sources
      .iter()
      .map(|node| node.y + node.height)
      .fold(f64::NEG_INFINITY, f64::max);
    let all_left = sources.iter().all(|node| node.side == "left");
    let Some(root) = layout.nodes.iter().find(|node| node.id == group.summary_id) else {
      continue;
    };
    let offset = document.topics.get(&group.summary_id);
    let desired_x = if all_left {
      left - root.width - 72.0
    } else {
      right + 72.0
    } + offset.map(|topic| topic.offset_x).unwrap_or(0.0);
    let desired_y =
      (top + bottom - root.height) / 2.0 + offset.map(|topic| topic.offset_y).unwrap_or(0.0);
    let dx = desired_x - root.x;
    let dy = desired_y - root.y;
    for node in &mut layout.nodes {
      if subtree.contains(&node.id) {
        node.x += dx;
        node.y += dy;
      }
    }
    for edge in &mut layout.edges {
      if !subtree.contains(&edge.source) {
        continue;
      }
      if let Some(points) = &mut edge.waypoints {
        for point in points {
          point.x += dx;
          point.y += dy;
        }
      }
    }
    for item in &mut layout.decorations {
      if item
        .topic_id
        .as_ref()
        .is_some_and(|id| subtree.contains(id))
      {
        item.x += dx;
        item.y += dy;
      }
    }
  }
  layout.nodes.retain(|node| !hidden.contains(&node.id));
  layout
    .edges
    .retain(|edge| !hidden.contains(&edge.source) && !hidden.contains(&edge.target));
  layout
    .decorations
    .retain(|item| !item.topic_id.as_ref().is_some_and(|id| hidden.contains(id)));
}
