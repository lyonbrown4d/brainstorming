use perfect_freehand::{InputPoint, StrokeOptions, get_stroke};

/// Pressure samples and the affine frame use the same options as live ink previews.
pub fn stroke_path(points: &[[f64; 3]], width: f64, transform: [f64; 4]) -> String {
  let points = points
    .iter()
    .map(|p| InputPoint::Array([p[0], p[1]], Some(p[2])))
    .collect::<Vec<_>>();
  let outline = get_stroke(
    &points,
    &StrokeOptions {
      size: Some(width),
      thinning: Some(0.5),
      smoothing: Some(0.5),
      streamline: Some(0.5),
      simulate_pressure: Some(false),
      last: Some(true),
      ..Default::default()
    },
  );
  if outline.is_empty() {
    return String::new();
  }
  format!(
    "M{} Z",
    outline
      .into_iter()
      .map(|p| format!(
        "{},{}",
        p[0] * transform[2] + transform[0],
        p[1] * transform[3] + transform[1]
      ))
      .collect::<Vec<_>>()
      .join(" L")
  )
}
