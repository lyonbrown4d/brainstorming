use super::model::{LocalLayout, Placement, Plan, Unit, bounds, decoration, edge};
use super::tree::tree_layout;
use std::collections::HashMap;

struct Column {
  id: String,
  width: f64,
  rows: Vec<(String, LocalLayout)>,
}

pub fn matrix(plan: &Plan, units: &HashMap<String, Unit>) -> LocalLayout {
  let root = &units[&plan.root_id];
  let mut row_heights: Vec<f64> = Vec::new();
  let mut header_height: f64 = 0.0;
  let mut columns = Vec::new();
  for id in plan.children.get(&root.id).into_iter().flatten() {
    let header = &units[id];
    header_height = header_height.max(header.height + 32.0);
    let mut width = header.width + 32.0;
    let mut rows = Vec::new();
    for (index, row_id) in plan.children.get(id).into_iter().flatten().enumerate() {
      let layout = tree_layout(plan, units, "right", row_id, None);
      let rect = bounds(&layout);
      width = width.max(rect.max_x - rect.min_x + 32.0);
      if row_heights.len() <= index {
        row_heights.resize(index + 1, 0.0);
      }
      row_heights[index] = row_heights[index].max(rect.max_y - rect.min_y + 32.0);
      rows.push((row_id.clone(), layout));
    }
    columns.push(Column {
      id: id.clone(),
      width,
      rows,
    });
  }
  let width: f64 = columns.iter().map(|column| column.width).sum();
  let body_height: f64 = row_heights.iter().sum();
  let top = root.height / 2.0 + 64.0;
  let mut left = -width / 2.0;
  let mut result = LocalLayout::default();
  result.placements.push(Placement {
    unit: root.clone(),
    x: 0.0,
    y: 0.0,
    direction: "down".into(),
  });
  for column in columns {
    result.placements.push(Placement {
      unit: units[&column.id].clone(),
      x: left + column.width / 2.0,
      y: top + header_height / 2.0,
      direction: "down".into(),
    });
    result
      .edges
      .push(edge(&root.id, &column.id, "down", Some("hidden")));
    result.decorations.push(decoration(
      format!("cell-{}", column.id),
      "cell",
      &column.id,
      None,
      [left, top],
      [column.width, header_height],
    ));
    if body_height > 0.0 {
      result.decorations.push(decoration(
        format!("column-{}", column.id),
        "cell",
        &column.id,
        None,
        [left, top + header_height],
        [column.width, body_height],
      ));
    }
    let mut y = top + header_height;
    for (index, (row_id, layout)) in column.rows.into_iter().enumerate() {
      let height = row_heights[index];
      let rect = bounds(&layout);
      let dx = left + 16.0 - rect.min_x;
      let dy = y + 16.0 - rect.min_y;
      result
        .placements
        .extend(layout.placements.into_iter().map(|mut item| {
          item.x += dx;
          item.y += dy;
          item
        }));
      result
        .edges
        .push(edge(&column.id, &row_id, "down", Some("hidden")));
      result
        .edges
        .extend(layout.edges.into_iter().map(|mut item| {
          item.routing = Some("orthogonal".into());
          item
        }));
      result.decorations.push(decoration(
        format!("cell-{row_id}"),
        "cell",
        &row_id,
        None,
        [left, y],
        [column.width, height],
      ));
      y += height;
    }
    left += column.width;
  }
  let mut row_boundary = top + header_height;
  for (index, height) in row_heights.into_iter().enumerate() {
    row_boundary += height;
    result.decorations.push(decoration(
      format!("matrix-row-{}-{index}", root.id),
      "grid-line",
      &root.id,
      Some("right"),
      [-width / 2.0, row_boundary],
      [width, 0.0],
    ));
  }
  result
}
