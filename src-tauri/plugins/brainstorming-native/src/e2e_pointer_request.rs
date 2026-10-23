//! Bounded test input contract. No event delivery lives in this module.
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Point {
  pub x: f64,
  pub y: f64,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Viewport {
  pub width: f64,
  pub height: f64,
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Request {
  #[serde(rename_all = "camelCase")]
  Start {
    viewport: Viewport,
    points: Vec<Point>,
    step_ms: u64,
    hold_ms: u64,
  },
  #[serde(rename_all = "camelCase")]
  Status { gesture_id: String },
  #[serde(rename_all = "camelCase")]
  Release { gesture_id: String },
}

pub(super) fn validate(
  viewport: Viewport,
  points: &[Point],
  step_ms: u64,
  hold_ms: u64,
) -> Result<(), String> {
  if !viewport.width.is_finite()
    || !viewport.height.is_finite()
    || !(1.0..=8192.0).contains(&viewport.width)
    || !(1.0..=8192.0).contains(&viewport.height)
    || !(2..=241).contains(&points.len())
    || !(8..=100).contains(&step_ms)
    || !(100..=10_000).contains(&hold_ms)
    || step_ms * (points.len() as u64 - 1) > 5_000
    || points.iter().any(|point| {
      !point.x.is_finite()
        || !point.y.is_finite()
        || point.x < 0.0
        || point.y < 0.0
        || point.x >= viewport.width
        || point.y >= viewport.height
    })
  {
    return Err("原生测试指针的坐标、步骤或时间超出范围".into());
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn bounded_drag_accepts_css_viewport_points_and_rejects_unsafe_ranges() {
    let viewport = Viewport {
      width: 800.0,
      height: 600.0,
    };
    let points = [Point { x: 0.0, y: 0.0 }, Point { x: 799.0, y: 599.0 }];
    assert!(validate(viewport, &points, 16, 10_000).is_ok());
    for point in [
      Point {
        x: f64::NAN,
        y: 1.0,
      },
      Point { x: 800.0, y: 1.0 },
      Point { x: 1.0, y: -1.0 },
    ] {
      assert!(validate(viewport, &[points[0], point], 16, 100).is_err());
    }
    assert!(validate(viewport, &points[..1], 16, 100).is_err());
    assert!(validate(viewport, &vec![points[0]; 242], 16, 100).is_err());
    assert!(validate(viewport, &vec![points[0]; 241], 100, 100).is_err());
    assert!(validate(viewport, &points, 7, 100).is_err());
    assert!(validate(viewport, &points, 16, 10_001).is_err());
    assert!(
      validate(
        Viewport {
          width: f64::INFINITY,
          ..viewport
        },
        &points,
        16,
        100
      )
      .is_err()
    );
  }

  #[test]
  fn request_rejects_unrecognized_controls_and_non_integer_timing() {
    use serde_json::json;
    let request = json!({"operation":"start", "viewport":{"width":800,"height":600},
      "points":[{"x":10,"y":10},{"x":20,"y":20}], "stepMs":16,"holdMs":1000});
    assert!(serde_json::from_value::<Request>(request.clone()).is_ok());
    let mut extra = request.clone();
    extra["windowLabel"] = json!("other");
    assert!(serde_json::from_value::<Request>(extra).is_err());
    let mut fractional = request;
    fractional["stepMs"] = json!(16.5);
    assert!(serde_json::from_value::<Request>(fractional).is_err());
    assert!(serde_json::from_value::<Request>(json!({"operation":"key"})).is_err());
  }
}
