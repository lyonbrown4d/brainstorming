use super::util::{Svg, fmt};
use brainstorming_geometry::shape_path as path;
pub use brainstorming_geometry::shape_path;

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
