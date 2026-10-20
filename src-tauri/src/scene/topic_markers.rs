use super::{
  VisualGeometry, measure,
  util::{self, Svg, field, fmt, number},
};
use serde_json::Value;

pub(super) fn draw_markers(
  svg: &mut Svg,
  topic: &Value,
  width: f64,
  body_height: f64,
  color: &str,
  visual: Option<&VisualGeometry>,
) -> Result<(), String> {
  let metadata = &topic["metadata"];
  let Some(markers) = metadata["markers"].as_array() else {
    return Ok(());
  };
  if markers.is_empty() {
    return Ok(());
  }
  let (marker_width, _, _, _) = measure::marker_size(metadata);
  let size = number(&metadata["markerStyle"], "size", 16.0);
  let position = field(&metadata["markerStyle"], "position");
  let x = if position == "left" {
    24.0
  } else if position == "right" {
    width - marker_width - 24.0
  } else {
    (width - marker_width) / 2.0
  };
  let y = if position == "top" {
    6.0
  } else if position == "bottom" || position.is_empty() {
    body_height - size - 6.0
  } else {
    (body_height - size) / 2.0
  };
  for (index, marker) in markers.iter().take(4).enumerate() {
    let marker = marker.as_str().unwrap_or("question");
    let icon = visual
      .and_then(|item| item.marker_icons.get(field(topic, "id")))
      .and_then(|items| items.get(index))
      .ok_or("缺少共享标记图标几何")?;
    let (viewbox, attributes, body) = super::markers::sanitize(icon)?;
    svg.0.push_str(&format!("<svg x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" viewBox=\"{}\" data-marker=\"{}\"{}>{}</svg>",fmt(x+index as f64*(size+4.0)),fmt(y),fmt(size),fmt(size),util::escape(&viewbox),util::escape(marker),attributes,body));
  }
  if markers.len() > 4 {
    svg.text(
      &format!("+{}", markers.len() - 4),
      &[
        ("x", fmt(x + 4.0 * (size + 4.0))),
        ("y", fmt(y + size / 2.0 + 4.0)),
        ("fill", color.into()),
        ("font-size", "10".into()),
      ],
    );
  }
  Ok(())
}
