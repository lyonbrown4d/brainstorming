use super::annotations::Annotation;
use super::util::{Svg, fmt};
use crate::layout_engine::Layout;
use serde_json::Value;

pub fn draw(
  svg: &mut Svg,
  _document: &Value,
  _layout: &Layout,
  annotations: &[Annotation],
  underlay: bool,
) {
  for (index, item) in annotations.iter().enumerate() {
    match item.kind.as_str() {
      "relation-path" if underlay => {
        let id = format!("export-arrow-{index}");
        if item.arrow != "none" {
          svg.0.push_str(&format!("<marker id=\"{id}\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"{}\"/></marker>",item.color));
        }
        let mut attrs = vec![
          ("d", item.path.clone()),
          ("fill", "none".into()),
          ("stroke", item.color.clone()),
          ("stroke-width", fmt(item.line_width)),
        ];
        if item.dashed {
          attrs.push(("stroke-dasharray", "6 4".into()))
        }
        if item.arrow == "both" {
          attrs.push(("marker-start", format!("url(#{id})")))
        }
        if item.arrow != "none" {
          attrs.push(("marker-end", format!("url(#{id})")))
        }
        svg.element("path", &attrs);
      }
      "relation-label" if underlay => {
        svg.element(
          "rect",
          &[
            ("x", fmt(item.x - 4.0)),
            ("y", fmt(item.y - 2.0)),
            ("width", fmt(item.width)),
            ("height", fmt(item.height)),
            ("fill", "#ffffff".into()),
            ("fill-opacity", "0.94".into()),
            ("rx", "4".into()),
          ],
        );
        text_lines(svg, item, item.x, item.y + 12.0);
      }
      "callout" if !underlay => {
        svg.element(
          "rect",
          &[
            ("x", fmt(item.x)),
            ("y", fmt(item.y)),
            ("width", fmt(item.width)),
            ("height", fmt(item.height)),
            ("rx", "8".into()),
            ("fill", "#fffbeb".into()),
            ("stroke", "#fcd34d".into()),
          ],
        );
        text_lines(svg, item, item.x + 12.0, item.y + 20.0);
      }
      "boundary" if underlay => {
        svg.element(
          "rect",
          &[
            ("x", fmt(item.x)),
            ("y", fmt(item.y)),
            ("width", fmt(item.width)),
            ("height", fmt(item.height)),
            ("rx", "12".into()),
            ("fill", item.color.clone()),
            ("fill-opacity", "0.04".into()),
            ("stroke", item.color.clone()),
            ("stroke-width", "2".into()),
            ("stroke-dasharray", "6 4".into()),
          ],
        );
        text_lines(svg, item, item.x + 8.0, item.y - 8.0);
      }
      "summary" if underlay => {
        svg.element(
          "path",
          &[
            (
              "d",
              format!(
                "M {} {} h 8 v {} h -8",
                fmt(item.x + item.width - 8.0),
                fmt(item.y),
                fmt(item.height)
              ),
            ),
            ("fill", "none".into()),
            ("stroke", item.color.clone()),
            ("stroke-width", "2".into()),
          ],
        );
        text_lines(svg, item, item.x + item.width + 8.0, item.y - 8.0);
      }
      _ => {}
    }
  }
}

fn text_lines(svg: &mut Svg, item: &Annotation, x: f64, y: f64) {
  for (index, line) in item.lines.iter().enumerate() {
    svg.text(
      line,
      &[
        ("x", fmt(x)),
        ("y", fmt(y + index as f64 * 18.0)),
        ("fill", item.color.clone()),
        ("font-size", "12".into()),
        ("font-family", "system-ui, sans-serif".into()),
      ],
    );
  }
}
