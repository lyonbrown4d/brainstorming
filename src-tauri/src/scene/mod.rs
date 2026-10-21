mod annotations;
mod annotations_draw;
mod appearance;
mod geometry;
mod markers;
mod measure;
mod relation_geometry;
mod scene_draw;
mod shapes;
mod topic_badges;
mod topic_content;
mod topic_markers;
mod topics;
mod util;

use crate::layout_engine::NodeSize;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use util::{Svg, field, fmt};

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisualGeometry {
  #[serde(default)]
  pub measurements: Vec<NodeSize>,
  #[serde(default)]
  pub topic_outlines: HashMap<String, String>,
  #[serde(default)]
  pub topic_fills: HashMap<String, String>,
  #[serde(default)]
  pub topic_accents: HashMap<String, String>,
  #[serde(default)]
  pub edge_paths: HashMap<String, String>,
  #[serde(default)]
  pub decoration_paths: HashMap<String, String>,
  #[serde(default)]
  pub drawing_paths: HashMap<String, String>,
  #[serde(default)]
  pub marker_icons: HashMap<String, Vec<String>>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
pub struct Scene {
  pub svg: String,
  pub width: f64,
  pub height: f64,
}

pub(super) struct RenderContext<'a> {
  pub document: &'a Value,
  pub palette: &'a appearance::Palette,
  pub colors: &'a HashMap<String, appearance::TopicColor>,
  pub sketch: bool,
  pub visual: Option<&'a VisualGeometry>,
  pub include_collapsed: bool,
}

/** The canvas and export renderer use the same deterministic topic measurements. */
pub(crate) fn measure_document(document: &Value) -> Result<Vec<NodeSize>, String> {
  let topics = document["topics"].as_object().ok_or("画布主题无效")?;
  let root = field(document, "rootId");
  Ok(
    topics
      .values()
      .map(|topic| measure::topic(topic, field(topic, "id") == root))
      .collect(),
  )
}

pub fn render(workbook: &Value, sheet_id: &str, include_collapsed: bool) -> Result<Scene, String> {
  render_with_geometry(workbook, sheet_id, include_collapsed, None)
}

pub fn render_with_geometry(
  workbook: &Value,
  sheet_id: &str,
  include_collapsed: bool,
  visual: Option<&VisualGeometry>,
) -> Result<Scene, String> {
  crate::document::validate_workbook(workbook).map_err(|error| error.to_string())?;
  let sheet = workbook["sheets"]
    .as_array()
    .and_then(|items| items.iter().find(|item| field(item, "id") == sheet_id))
    .ok_or("画布不存在")?;
  let mut document = sheet["document"].clone();
  if include_collapsed && let Some(topics) = document["topics"].as_object_mut() {
    for item in topics.values_mut() {
      item["collapsed"] = Value::Bool(false)
    }
  }
  let sizes = if let Some(visual) = visual.filter(|item| !item.measurements.is_empty()) {
    visual.measurements.clone()
  } else {
    measure_document(&document)?
  };
  let layout = crate::layout_engine::compute(&document, &sizes)?;
  let palette = appearance::palette(&document);
  let colors = appearance::all(&document, &palette);
  let sketch = field(&document["settings"], "visualStyle") == "sketch";
  let annotations = annotations::collect(&document, &layout);
  let bounds = scene_draw::bounds(&document, &layout, &annotations)?;
  let (min_x, min_y, width, height) = bounds;
  if !width.is_finite()
    || !height.is_finite()
    || width < 1.0
    || height < 1.0
    || width > 1_000_000.0
    || height > 1_000_000.0
  {
    return Err("画布尺寸超过导出限制".into());
  }
  let mut svg = Svg(format!(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\" width=\"{}\" height=\"{}\" role=\"img\">",
    fmt(min_x),
    fmt(min_y),
    fmt(width),
    fmt(height),
    fmt(width),
    fmt(height)
  ));
  svg.0.push_str("<title>");
  svg.0.push_str(&util::escape(field(&document, "title")));
  svg.0.push_str("</title>");
  svg.element(
    "rect",
    &[
      ("x", fmt(min_x)),
      ("y", fmt(min_y)),
      ("width", fmt(width)),
      ("height", fmt(height)),
      ("fill", palette.background.clone()),
    ],
  );
  scene_draw::draw_ink(&mut svg, &document, visual)?;
  annotations_draw::draw(&mut svg, &document, &layout, &annotations, true);
  scene_draw::draw_structures(&mut svg, &document, &layout, &colors, sketch, visual)?;
  scene_draw::draw_edges(&mut svg, &document, &layout, &colors, sketch, visual)?;
  topics::draw(
    &mut svg,
    &layout,
    &RenderContext {
      document: &document,
      palette: &palette,
      colors: &colors,
      sketch,
      visual,
      include_collapsed,
    },
  )?;
  annotations_draw::draw(&mut svg, &document, &layout, &annotations, false);
  svg.0.push_str("</svg>");
  if svg.0.len() > 40 * 1024 * 1024 {
    return Err("导出 SVG 超过 40 MiB".into());
  }
  Ok(Scene {
    svg: svg.0,
    width,
    height,
  })
}
