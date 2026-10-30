use super::matrix::matrix;
use super::model::{
  Bounds, Document, Layout, LayoutNode, LocalLayout, NodeSize, Plan, Unit, bounds,
};
use super::structures::{aligned_tree, brace, spine, table};
use super::tree::{map_layout, tree_layout};
use std::collections::{HashMap, HashSet};

struct Computed {
  layout: LocalLayout,
  bounds: Bounds,
  units: HashMap<String, Unit>,
}

fn plans(document: &Document) -> Result<(Vec<Plan>, Vec<String>), String> {
  let floating: HashSet<_> = document.floating_ids.iter().cloned().collect();
  let summary: HashSet<_> = document
    .groups
    .iter()
    .map(|group| group.summary_id.clone())
    .collect();
  let roots: Vec<_> = std::iter::once(document.root_id.clone())
    .chain(document.floating_ids.iter().cloned())
    .chain(document.groups.iter().map(|group| group.summary_id.clone()))
    .collect();
  let mut plans = Vec::<Plan>::new();
  for root_id in &roots {
    let topic = document.topics.get(root_id).ok_or("布局根主题不存在")?;
    let kind = topic
      .structure
      .as_deref()
      .unwrap_or(&document.layout)
      .to_owned();
    let plan_index = plans.len();
    plans.push(Plan {
      root_id: root_id.clone(),
      kind,
      ids: Vec::new(),
      children: HashMap::new(),
      components: HashMap::new(),
    });
    let mut pending = vec![(root_id.clone(), plan_index)];
    while let Some((id, current)) = pending.pop() {
      let topic = document.topics.get(&id).ok_or("布局主题不存在")?;
      plans[current].ids.push(id.clone());
      let children: Vec<_> = if topic.collapsed {
        Vec::new()
      } else {
        topic
          .children
          .iter()
          .filter(|child| {
            !summary.contains(*child) && (id != document.root_id || !floating.contains(*child))
          })
          .cloned()
          .collect()
      };
      plans[current].children.insert(id.clone(), children.clone());
      for child_id in children.into_iter().rev() {
        let child = document.topics.get(&child_id).ok_or("布局子主题不存在")?;
        if child
          .structure
          .as_ref()
          .is_some_and(|kind| kind != &plans[current].kind)
        {
          let next = plans.len();
          plans.push(Plan {
            root_id: child_id.clone(),
            kind: child.structure.clone().unwrap_or_default(),
            ids: Vec::new(),
            children: HashMap::new(),
            components: HashMap::new(),
          });
          plans[current].ids.push(child_id.clone());
          plans[current].children.insert(child_id.clone(), Vec::new());
          plans[current]
            .components
            .insert(child_id.clone(), child_id.clone());
          pending.push((child_id, next));
        } else {
          pending.push((child_id, current));
        }
      }
    }
  }
  Ok((plans, roots))
}

fn local(
  plan: &Plan,
  units: &HashMap<String, Unit>,
  sides: &HashMap<String, String>,
) -> Result<LocalLayout, String> {
  Ok(match plan.kind.as_str() {
    "map" => map_layout(plan, units, sides),
    "logic-right" => tree_layout(plan, units, "right", &plan.root_id, None),
    "logic-left" => tree_layout(plan, units, "left", &plan.root_id, None),
    "org-down" => tree_layout(plan, units, "down", &plan.root_id, None),
    "org-up" => tree_layout(plan, units, "up", &plan.root_id, None),
    "tree-down" => aligned_tree(plan, units, "down"),
    "tree-up" => aligned_tree(plan, units, "up"),
    "brace-right" => brace(plan, units, "right"),
    "brace-left" => brace(plan, units, "left"),
    "tree-table-right" => table(plan, units, "right"),
    "tree-table-down" => table(plan, units, "down"),
    "fishbone" | "timeline" | "timeline-vertical" => spine(plan, units, &plan.kind),
    "matrix" => matrix(plan, units),
    _ => return Err("未知布局结构".into()),
  })
}

pub fn structured(document: &Document, measurements: &[NodeSize]) -> Result<Layout, String> {
  let (plans, roots) = plans(document)?;
  let sizes: HashMap<_, _> = measurements
    .iter()
    .map(|item| (item.id.as_str(), item))
    .collect();
  let sides: HashMap<_, _> = document
    .topics
    .iter()
    .map(|(id, topic)| (id.clone(), topic.side.clone()))
    .collect();
  let mut computed = HashMap::<String, Computed>::new();
  for plan in plans.iter().rev() {
    let mut units = HashMap::new();
    for id in &plan.ids {
      let (width, height, component_id) = if let Some(component_id) = plan.components.get(id) {
        let nested = computed.get(component_id).ok_or("布局子组件不存在")?;
        (
          nested.bounds.max_x - nested.bounds.min_x,
          nested.bounds.max_y - nested.bounds.min_y,
          Some(component_id.clone()),
        )
      } else {
        let size = sizes
          .get(id.as_str())
          .ok_or_else(|| format!("缺少布局测量：{id}"))?;
        if !size.width.is_finite()
          || !size.height.is_finite()
          || size.width <= 0.0
          || size.height <= 0.0
        {
          return Err(format!("布局测量无效：{id}"));
        }
        (size.width, size.height, None)
      };
      units.insert(
        id.clone(),
        Unit {
          id: id.clone(),
          width,
          height,
          component_id,
        },
      );
    }
    let layout = local(plan, &units, &sides)?;
    let bounds = bounds(&layout);
    computed.insert(
      plan.root_id.clone(),
      Computed {
        layout,
        bounds,
        units,
      },
    );
  }
  let mut result = Layout {
    nodes: Vec::new(),
    edges: Vec::new(),
    decorations: Vec::new(),
  };
  let main_max_x = computed
    .get(&document.root_id)
    .map(|item| item.bounds.max_x)
    .unwrap_or(0.0);
  let mut pending = Vec::<(String, f64, f64)>::new();
  for (index, id) in roots.iter().enumerate() {
    let current = computed.get(id).ok_or("布局组件不存在")?;
    let unit = current.units.get(id).ok_or("布局主题不存在")?;
    if id == &document.root_id {
      pending.push((id.clone(), 0.0, 0.0));
    } else {
      let position = document.floating_positions.get(id);
      pending.push((
        id.clone(),
        position.map(|p| p.x).unwrap_or(main_max_x + 240.0) + unit.width / 2.0,
        position.map(|p| p.y).unwrap_or(index as f64 * 240.0) + unit.height / 2.0,
      ));
    }
  }
  pending.reverse();
  while let Some((id, origin_x, origin_y)) = pending.pop() {
    let component = computed.get(&id).ok_or("布局组件不存在")?;
    for placement in &component.layout.placements {
      let unit = &placement.unit;
      if let Some(nested_id) = &unit.component_id {
        let nested = computed.get(nested_id).ok_or("布局子组件不存在")?;
        pending.push((
          nested_id.clone(),
          origin_x + placement.x - (nested.bounds.min_x + nested.bounds.max_x) / 2.0,
          origin_y + placement.y - (nested.bounds.min_y + nested.bounds.max_y) / 2.0,
        ));
      } else {
        let side = if placement.direction == "left" {
          "left"
        } else if placement.direction == "right" {
          "right"
        } else {
          sides.get(&unit.id).map(String::as_str).unwrap_or("right")
        };
        result.nodes.push(LayoutNode {
          id: unit.id.clone(),
          x: origin_x + placement.x - unit.width / 2.0,
          y: origin_y + placement.y - unit.height / 2.0,
          width: unit.width,
          height: unit.height,
          side: side.into(),
          direction: Some(placement.direction.clone()),
        });
      }
    }
    result
      .edges
      .extend(component.layout.edges.iter().cloned().map(|mut item| {
        if let Some(points) = &mut item.waypoints {
          for point in points {
            point.x += origin_x;
            point.y += origin_y;
          }
        }
        item
      }));
    result.decorations.extend(
      component
        .layout
        .decorations
        .iter()
        .cloned()
        .map(|mut item| {
          item.x += origin_x;
          item.y += origin_y;
          item
        }),
    );
  }
  let nodes: HashMap<_, _> = result
    .nodes
    .iter()
    .map(|node| (node.id.as_str(), node))
    .collect();
  for item in &mut result.edges {
    let Some(points) = &mut item.waypoints else {
      continue;
    };
    let Some(target) = nodes.get(item.target.as_str()) else {
      continue;
    };
    let direction = item.direction.as_deref().unwrap_or("right");
    if let Some(last) = points.last_mut() {
      last.x = target.x
        + if direction == "left" {
          target.width
        } else if direction == "right" {
          0.0
        } else {
          target.width / 2.0
        };
      last.y = target.y
        + if direction == "up" {
          target.height
        } else if direction == "down" {
          0.0
        } else {
          target.height / 2.0
        };
    }
  }
  Ok(result)
}
