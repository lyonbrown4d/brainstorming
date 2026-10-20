use super::{
  RenderContext, measure, shapes, topic_content,
  util::{self, Svg, field, fmt, number},
};
use crate::layout_engine::Layout;
use serde_json::Value;

pub fn draw(svg: &mut Svg, layout: &Layout, context: &RenderContext<'_>) -> Result<(), String> {
  let document = context.document;
  let sketch = context.sketch;
  let visual = context.visual;
  let root = field(document, "rootId");
  let branch_ids = document["topics"][root]["children"]
    .as_array()
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
    .collect::<Vec<_>>();
  for node in &layout.nodes {
    let topic = &document["topics"][&node.id];
    if topic.is_null() {
      continue;
    }
    let style = &topic["style"];
    let shape = field(style, "shape");
    let root_topic = node.id == root;
    let colors = context.colors.get(&node.id).ok_or("主题配色缺失")?;
    let fill = colors.fill.clone();
    let stroke = if root_topic && !sketch {
      fill.clone()
    } else if root_topic {
      colors.text.clone()
    } else {
      colors.stroke.clone()
    };
    let font = number(style, "fontSize", if root_topic { 24.0 } else { 16.0 });
    let bold = root_topic || branch_ids.contains(&node.id.as_str()) || style["bold"] == true;
    svg.0.push_str(&format!(
      "<g transform=\"translate({} {})\">",
      fmt(node.x),
      fmt(node.y)
    ));
    let outline = if sketch && shape != "text" {
      Some(
        visual
          .and_then(|item| item.topic_outlines.get(&node.id))
          .ok_or("缺少共享主题素描几何")?
          .as_str(),
      )
    } else {
      None
    };
    let shade = if sketch {
      visual
        .and_then(|item| item.topic_fills.get(&node.id))
        .map(String::as_str)
    } else {
      None
    };
    shapes::draw(
      svg,
      shape,
      node.width,
      node.height,
      &fill,
      &stroke,
      outline.map(|value| (value, shade)),
    )?;
    if sketch && matches!(shape, "sticky" | "card") {
      let suffix = if shape == "sticky" { "fold" } else { "header" };
      let key = format!("{}:{suffix}", node.id);
      let accent = visual
        .and_then(|item| item.topic_accents.get(&key))
        .ok_or("缺少共享主题装饰素描几何")?;
      svg.element(
        "path",
        &[
          ("d", util::path(accent)?.into()),
          ("fill", "none".into()),
          ("stroke", stroke.clone()),
          (
            "stroke-width",
            if shape == "card" {
              "3".into()
            } else {
              "1".into()
            },
          ),
        ],
      );
    }
    let (inset_x, inset_y) = measure::insets(shape);
    let content_x = node.width * inset_x;
    let content_y = node.height * inset_y;
    let content_w = node.width * (1.0 - 2.0 * inset_x);
    let content_h = node.height * (1.0 - 2.0 * inset_y);
    svg.0.push_str(&format!(
      "<g transform=\"translate({} {})\">",
      fmt(content_x),
      fmt(content_y)
    ));
    topic_content::draw_content(
      svg,
      context,
      topic,
      topic_content::ContentLayout {
        root: root_topic,
        shape,
        font,
        bold,
        width: content_w,
        height: content_h,
        color: &colors.text,
      },
    )?;
    svg.0.push_str("</g></g>");
  }
  Ok(())
}
