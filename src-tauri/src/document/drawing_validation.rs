use super::{
  Result,
  error::invalid,
  presentation_validation::{bounded_text, number},
  validation::*,
};
use serde_json::Value;
use std::collections::HashSet;

pub(super) fn validate(value: &Value) -> Result<()> {
  let mut ids = HashSet::new();
  let mut total = 0;
  for stroke in list(value, 2000)? {
    keys(
      stroke,
      &[
        "id",
        "color",
        "width",
        "points",
        "transform",
        "spatialDepth",
      ],
    )?;
    let stroke_id = id(&stroke["id"])?;
    bounded_text(&stroke["id"], 128, false)?;
    if !ids.insert(stroke_id) {
      return Err(invalid("画笔笔画 ID 重复"));
    }
    let color = text(&stroke["color"])?;
    if color.len() != 7
      || !color.starts_with('#')
      || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    {
      return Err(invalid("画笔颜色须为六位十六进制值"));
    }
    number(&stroke["width"], 1., 24.)?;
    if let Some(depth) = stroke.get("spatialDepth") {
      number(depth, -1_000_000., 1_000_000.)?;
    }
    let transform = stroke.get("transform");
    if let Some(transform) = transform {
      keys(transform, &["x", "y", "scaleX", "scaleY"])?;
      number(&transform["x"], -1e10, 1e10)?;
      number(&transform["y"], -1e10, 1e10)?;
      number(&transform["scaleX"], 0.001, 1000.)?;
      number(&transform["scaleY"], 0.001, 1000.)?;
    }
    let points = list(&stroke["points"], 8192)?;
    total += points.len();
    if points.is_empty() || total > 262_144 {
      return Err(invalid("画笔点数超过限制"));
    }
    for point in points {
      keys(point, &["x", "y", "pressure"])?;
      number(&point["x"], -1_000_000., 1_000_000.)?;
      number(&point["y"], -1_000_000., 1_000_000.)?;
      number(&point["pressure"], 0., 1.)?;
      if let Some(transform) = transform {
        for (axis, scale) in [("x", "scaleX"), ("y", "scaleY")] {
          let value = point[axis].as_f64().unwrap_or_default()
            * transform[scale].as_f64().unwrap_or_default()
            + transform[axis].as_f64().unwrap_or_default();
          if !value.is_finite() || value.abs() > 1_000_000. {
            return Err(invalid("变换后的笔迹坐标超出范围"));
          }
        }
      }
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::validate;
  use serde_json::json;

  #[test]
  fn accepts_valid_strokes_and_rejects_invalid_boundaries() {
    let stroke =
      json!({"id":"ink-1","color":"#123abc","width":4,"points":[{"x":-20,"y":35,"pressure":0.5}]});
    assert!(validate(&json!([stroke.clone()])).is_ok());
    assert!(validate(&json!([stroke.clone(), stroke.clone()])).is_err());
    for (field, value) in [
      ("color", json!("red")),
      ("width", json!(25)),
      ("points", json!([])),
      ("unknown", json!(true)),
    ] {
      let mut invalid = stroke.clone();
      invalid[field] = value;
      assert!(validate(&json!([invalid])).is_err());
    }
    for (field, value) in [("x", json!(1_000_001)), ("pressure", json!(1.1))] {
      let mut invalid = stroke.clone();
      invalid["points"][0][field] = value;
      assert!(validate(&json!([invalid])).is_err());
    }
  }
}
