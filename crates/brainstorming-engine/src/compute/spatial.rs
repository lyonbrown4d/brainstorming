use crate::layout_engine::Layout;
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

#[derive(Clone, Serialize, specta::Type)]
pub struct SpatialLayout {
  pub layout: Layout,
  pub depths: BTreeMap<String, f64>,
}

/// Calculate depth independently of screen projection; each floating root begins a new tree.
pub fn depths(document: &Value) -> Result<BTreeMap<String, f64>, String> {
  let topics = document["topics"].as_object().ok_or("空间布局主题无效")?;
  let root_id = document["rootId"].as_str().ok_or("空间布局根主题无效")?;
  let spacing = document["settings"]["spatial"]["spacing"]
    .as_f64()
    .unwrap_or(100.0);
  if !spacing.is_finite() || !(0.0..=200.0).contains(&spacing) {
    return Err("空间层距无效".into());
  }
  let floating: HashSet<&str> = document["floatingIds"]
    .as_array()
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
    .collect();
  let mut roots = Vec::with_capacity(topics.len() + floating.len() + 1);
  roots.push(root_id);
  roots.extend(floating.iter().copied());
  roots.extend(topics.keys().map(String::as_str));
  let mut seen = HashSet::with_capacity(topics.len());
  let mut result = BTreeMap::new();
  for root in roots {
    if !topics.contains_key(root) || seen.contains(root) {
      continue;
    }
    let mut stack = vec![(root, 0usize, 0.0f64, 0.0f64)];
    while let Some((id, depth, branch, inherited)) = stack.pop() {
      if !seen.insert(id) {
        continue;
      }
      let topic = &topics[id];
      let local = topic["style"]["spatialDepth"].as_f64().unwrap_or(0.0);
      let z = depth as f64 * spacing + branch + inherited + local;
      if !z.is_finite() {
        return Err("空间深度无效".into());
      }
      result.insert(id.to_owned(), z);
      let children: Vec<&str> = topic["children"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|child| !floating.contains(*child) && topics.contains_key(*child))
        .collect();
      for (index, child) in children.iter().enumerate().rev() {
        let next_branch = if depth == 0 {
          (index as f64 - (children.len() as f64 - 1.0) / 2.0) * spacing * 0.7
        } else {
          branch
        };
        stack.push((child, depth + 1, next_branch, inherited + local));
      }
    }
  }
  Ok(result)
}

#[cfg(test)]
mod tests {
  use super::depths;
  use serde_json::json;

  #[test]
  fn inherited_depth_and_floating_roots() {
    let document = json!({
      "rootId": "root",
      "settings": { "spatial": { "spacing": 100 } },
      "floatingIds": ["float"],
      "topics": {
        "root": { "children": ["left", "right", "float"], "style": { "spatialDepth": 20 } },
        "left": { "children": ["child"], "style": { "spatialDepth": 15 } },
        "right": { "children": [] },
        "child": { "children": [] },
        "float": { "children": ["float-child"], "style": { "spatialDepth": -10 } },
        "float-child": { "children": [] }
      }
    });
    let result = depths(&document).unwrap();
    assert_eq!(result["root"], 20.0);
    assert_eq!(result["left"], 100.0);
    assert_eq!(result["right"], 155.0);
    assert_eq!(result["child"], 200.0);
    assert_eq!(result["float"], -10.0);
    assert_eq!(result["float-child"], 90.0);
  }

  #[test]
  fn malformed_cycle_is_bounded() {
    let document = json!({
      "rootId": "root",
      "topics": {
        "root": { "children": ["child"] },
        "child": { "children": ["root"] }
      }
    });
    assert_eq!(depths(&document).unwrap().len(), 2);
  }
}
