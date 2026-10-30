use crate::fmt;

pub fn shape_path(shape: &str, width: f64, height: f64) -> String {
  let point = |x: f64, y: f64| format!("{} {}", fmt(x * width / 100.0), fmt(y * height / 100.0));
  let polygon = |points: &[(f64, f64)]| {
    format!(
      "M{} Z",
      points
        .iter()
        .map(|(x, y)| point(*x, *y))
        .collect::<Vec<_>>()
        .join(" L")
    )
  };
  match shape {
    "ellipse" | "circle" => format!(
      "M0 {} A{} {} 0 1 0 {} {} A{} {} 0 1 0 0 {} Z",
      fmt(height / 2.0),
      fmt(width / 2.0),
      fmt(height / 2.0),
      fmt(width),
      fmt(height / 2.0),
      fmt(width / 2.0),
      fmt(height / 2.0),
      fmt(height / 2.0)
    ),
    "diamond" => polygon(&[(50.0, 0.0), (100.0, 50.0), (50.0, 100.0), (0.0, 50.0)]),
    "hexagon" => polygon(&[
      (16.0, 0.0),
      (84.0, 0.0),
      (100.0, 50.0),
      (84.0, 100.0),
      (16.0, 100.0),
      (0.0, 50.0),
    ]),
    "tag" => polygon(&[
      (0.0, 0.0),
      (84.0, 0.0),
      (100.0, 50.0),
      (84.0, 100.0),
      (0.0, 100.0),
    ]),
    "flag" => polygon(&[
      (0.0, 0.0),
      (100.0, 0.0),
      (86.0, 50.0),
      (100.0, 100.0),
      (0.0, 100.0),
    ]),
    "bookmark" => polygon(&[
      (0.0, 0.0),
      (100.0, 0.0),
      (100.0, 100.0),
      (50.0, 84.0),
      (0.0, 100.0),
    ]),
    "speech" => polygon(&[
      (0.0, 0.0),
      (100.0, 0.0),
      (100.0, 82.0),
      (34.0, 82.0),
      (16.0, 100.0),
      (20.0, 82.0),
      (0.0, 82.0),
    ]),
    "sticky" => polygon(&[
      (0.0, 0.0),
      (100.0, 0.0),
      (100.0, 84.0),
      (84.0, 100.0),
      (0.0, 100.0),
    ]),
    "cloud" => format!(
      "M{} C{} {} {} C{} {} {} C{} {} {} C{} {} {} C{} {} {} C{} {} {} Z",
      point(18.0, 80.0),
      point(0.0, 84.0),
      point(0.0, 40.0),
      point(13.0, 36.0),
      point(4.0, 6.0),
      point(35.0, 0.0),
      point(46.0, 15.0),
      point(64.0, 0.0),
      point(92.0, 3.0),
      point(89.0, 29.0),
      point(100.0, 28.0),
      point(100.0, 67.0),
      point(91.0, 72.0),
      point(96.0, 100.0),
      point(61.0, 100.0),
      point(50.0, 87.0),
      point(38.0, 100.0),
      point(16.0, 100.0),
      point(18.0, 80.0)
    ),
    _ => {
      let radius = if shape == "rectangle" {
        0.0
      } else if shape == "capsule" {
        width.min(height) / 2.0
      } else {
        14.0_f64.min(height / 4.0)
      };
      format!(
        "M{} 0 H{} Q{} 0 {} {} V{} Q{} {} {} {} H{} Q0 {} 0 {} V{} Q0 0 {} 0 Z",
        fmt(radius),
        fmt(width - radius),
        fmt(width),
        fmt(width),
        fmt(radius),
        fmt(height - radius),
        fmt(width),
        fmt(height),
        fmt(width - radius),
        fmt(height),
        fmt(radius),
        fmt(height),
        fmt(height - radius),
        fmt(radius),
        fmt(radius)
      )
    }
  }
}
