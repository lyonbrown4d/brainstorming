use super::util::{Svg, fmt};

pub fn path(shape: &str, width: f64, height: f64) -> String {
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

pub fn draw(
  svg: &mut Svg,
  shape: &str,
  width: f64,
  height: f64,
  fill: &str,
  stroke: &str,
  sketch: Option<(&str, Option<&str>)>,
) -> Result<(), String> {
  if shape == "text" {
    return Ok(());
  }
  if let Some((outline, shading)) = sketch {
    svg.element(
      "path",
      &[
        ("d", path(shape, width, height)),
        ("fill", fill.into()),
        ("stroke", "none".into()),
      ],
    );
    if let Some(shading) = shading {
      svg.element(
        "path",
        &[
          ("d", super::util::path(shading)?.into()),
          ("fill", "none".into()),
          ("stroke", stroke.into()),
          ("stroke-width", "0.8".into()),
          ("stroke-opacity", "0.1".into()),
          ("data-sketch", "fill".into()),
        ],
      );
    }
    svg.element(
      "path",
      &[
        ("d", super::util::path(outline)?.into()),
        ("fill", "none".into()),
        ("stroke", stroke.into()),
        ("stroke-width", "1.5".into()),
        ("data-sketch", "outline".into()),
        ("stroke-linecap", "round".into()),
        ("stroke-linejoin", "round".into()),
      ],
    );
  } else if matches!(shape, "ellipse" | "circle") {
    svg.element(
      "ellipse",
      &[
        ("cx", fmt(width / 2.0)),
        ("cy", fmt(height / 2.0)),
        ("rx", fmt(width / 2.0)),
        ("ry", fmt(height / 2.0)),
        ("fill", fill.into()),
        ("stroke", stroke.into()),
        ("stroke-width", "1.5".into()),
      ],
    );
  } else {
    svg.element(
      "path",
      &[
        ("d", path(shape, width, height)),
        ("fill", fill.into()),
        ("stroke", stroke.into()),
        ("stroke-width", "1.5".into()),
      ],
    );
  }
  if shape == "sticky" && sketch.is_none() {
    svg.element(
      "path",
      &[
        (
          "d",
          format!(
            "M{} {} V{} H{}",
            fmt(width * 0.84),
            fmt(height),
            fmt(height * 0.84),
            fmt(width)
          ),
        ),
        ("fill", "none".into()),
        ("stroke", stroke.into()),
      ],
    );
  }
  if shape == "card" && sketch.is_none() {
    svg.element(
      "path",
      &[
        (
          "d",
          format!(
            "M{} {} H{}",
            fmt(width * 0.08),
            fmt(height * 0.12),
            fmt(width * 0.92)
          ),
        ),
        ("fill", "none".into()),
        ("stroke", stroke.into()),
        ("stroke-width", "3".into()),
      ],
    );
  }
  Ok(())
}
