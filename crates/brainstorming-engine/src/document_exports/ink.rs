use super::{Page, Result};
use crate::scene::VisualGeometry;
use serde_json::Value;

/// Drawing-only selections have no synthetic center topic in the visual output.
pub(crate) fn render(document: &Value, geometry: &VisualGeometry) -> Result<Page> {
  let mut bounds = [
    f64::INFINITY,
    f64::INFINITY,
    f64::NEG_INFINITY,
    f64::NEG_INFINITY,
  ];
  let mut paths = String::new();
  for stroke in document["drawings"].as_array().into_iter().flatten() {
    let id = stroke["id"].as_str().ok_or("笔迹标识无效")?;
    let path = geometry.drawing_paths.get(id).ok_or("缺少笔迹几何")?;
    let transform = &stroke["transform"];
    let sx = transform["scaleX"].as_f64().unwrap_or(1.0);
    let sy = transform["scaleY"].as_f64().unwrap_or(1.0);
    let tx = transform["x"].as_f64().unwrap_or(0.0);
    let ty = transform["y"].as_f64().unwrap_or(0.0);
    let padding = stroke["width"].as_f64().unwrap_or(4.0) * sx.max(sy) * 2.0;
    for point in stroke["points"].as_array().into_iter().flatten() {
      let x = point["x"].as_f64().ok_or("笔迹位置无效")? * sx + tx;
      let y = point["y"].as_f64().ok_or("笔迹位置无效")? * sy + ty;
      bounds[0] = bounds[0].min(x - padding);
      bounds[1] = bounds[1].min(y - padding);
      bounds[2] = bounds[2].max(x + padding);
      bounds[3] = bounds[3].max(y + padding);
    }
    paths.push_str(&format!(
      "<path d=\"{}\" fill=\"{}\"/>",
      quick_xml::escape::escape(path),
      quick_xml::escape::escape(stroke["color"].as_str().unwrap_or("#242731"))
    ));
  }
  let [x, y, right, bottom] = bounds;
  let width = (right - x).max(1.0);
  let height = (bottom - y).max(1.0);
  if !bounds.iter().all(|value| value.is_finite()) || width > 1_000_000.0 || height > 1_000_000.0 {
    return Err("笔迹选区尺寸无效".into());
  }
  let background = crate::scene::background(document);
  Ok(Page {
    title: document["title"].as_str().unwrap_or("Drawing").into(),
    width,
    height,
    svg: format!(
      "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"{x} {y} {width} {height}\"><rect x=\"{x}\" y=\"{y}\" width=\"{width}\" height=\"{height}\" fill=\"{background}\"/>{paths}</svg>"
    ),
  })
}
