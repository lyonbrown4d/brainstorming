use super::topic_markers::draw_markers;
use super::{
  RenderContext, measure,
  util::{Svg, field, fmt},
};
use serde_json::Value;

pub(super) struct ContentLayout<'a> {
  pub root: bool,
  pub shape: &'a str,
  pub font: f64,
  pub bold: bool,
  pub width: f64,
  pub height: f64,
  pub color: &'a str,
}

pub(super) fn draw_content(
  svg: &mut Svg,
  context: &RenderContext<'_>,
  topic: &Value,
  layout: ContentLayout<'_>,
) -> Result<(), String> {
  let ContentLayout {
    root,
    shape,
    font,
    bold,
    width,
    height,
    color,
  } = layout;
  let document = context.document;
  let font_family = context.palette.font.as_str();
  let include_collapsed = context.include_collapsed;
  let visual = context.visual;
  let metadata = &topic["metadata"];
  let (_, marker_height, extra_width, extra_height) = measure::marker_size(metadata);
  let marker_position = field(&metadata["markerStyle"], "position");
  let preview = matches!(shape, "sticky" | "card") && !field(topic, "notes").is_empty();
  let missing_image = shape == "image" && topic["image"].is_null();
  let badge = metadata["task"].is_object()
    || metadata["labels"]
      .as_array()
      .is_some_and(|items| !items.is_empty())
    || metadata["link"].is_object()
    || metadata["equation"].is_string()
    || metadata["audioAssetId"].is_string();
  let footer = (if badge { 28.0 } else { 0.0 })
    + (if !field(topic, "notes").is_empty()
      || topic["attachments"]
        .as_array()
        .is_some_and(|items| !items.is_empty())
    {
      28.0
    } else {
      0.0
    })
    + (if preview {
      48.0
    } else if missing_image {
      52.0
    } else {
      0.0
    });
  let body_height = height - footer;
  let content_x = if marker_position == "left" {
    extra_width - 24.0
  } else if marker_position == "right" {
    24.0
  } else {
    0.0
  };
  let content_width = width - extra_width;
  let center = content_x + content_width / 2.0;
  let natural = measure::content_height(topic, root) - footer;
  let mut y = (if root { 14.0 } else { 10.0 })
    + (if marker_position == "top" {
      extra_height
    } else {
      0.0
    })
    + (body_height - natural).max(0.0) / 2.0;
  if topic["image"].is_object() {
    let image = &topic["image"];
    let asset_id = field(image, "assetId");
    let asset = &document["assets"][asset_id];
    let mime = field(asset, "mimeType");
    let data = field(asset, "data");
    if !matches!(
      mime,
      "image/png" | "image/jpeg" | "image/gif" | "image/webp"
    ) || data.len() > 12 * 1024 * 1024
      || !data
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
    {
      return Err("图片资源无法安全嵌入 SVG".into());
    }
    let (w, h) = measure::image_size(image);
    svg.element(
      "image",
      &[
        ("x", fmt(center - w / 2.0)),
        ("y", fmt(y)),
        ("width", fmt(w)),
        ("height", fmt(h)),
        ("href", format!("data:{mime};base64,{data}")),
      ],
    );
    y += h + 12.0;
  }
  let max_text = topic["style"]["width"]
    .as_f64()
    .map(|_| (content_width - if root { 56.0 } else { 44.0 }).max(font))
    .unwrap_or(if root { 224.0 } else { 196.0 });
  let lines = wrap(field(topic, "title"), font, max_text);
  let line_height = (font * 1.5).ceil();
  for (index, line) in lines.iter().enumerate() {
    svg.text(
      if line.is_empty() { " " } else { line },
      &[
        ("x", fmt(center)),
        ("y", fmt(y + font + index as f64 * line_height)),
        ("text-anchor", "middle".into()),
        ("fill", color.into()),
        ("font-family", font_family.into()),
        ("font-size", fmt(font)),
        (
          "font-weight",
          if bold { "700".into() } else { "400".into() },
        ),
        (
          "font-style",
          if topic["style"]["italic"] == true {
            "italic".into()
          } else {
            "normal".into()
          },
        ),
        ("xml:space", "preserve".into()),
      ],
    );
  }
  draw_markers(svg, topic, width, body_height, color, visual)?;
  if preview || missing_image {
    let text = if preview {
      field(topic, "notes")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(160)
        .collect::<String>()
    } else {
      "添加图片".into()
    };
    for (index, line) in wrap(&text, 11.0, (width - 32.0).min(224.0))
      .into_iter()
      .take(2)
      .enumerate()
    {
      svg.text(
        &line,
        &[
          ("x", fmt(center)),
          (
            "y",
            fmt(body_height + if shape == "image" { 28.0 } else { 14.0 } + index as f64 * 16.0),
          ),
          ("text-anchor", "middle".into()),
          ("fill", color.into()),
          ("font-family", font_family.into()),
          ("font-size", "11".into()),
        ],
      );
    }
  }
  super::topic_badges::draw(
    svg,
    metadata,
    width,
    body_height
      + (if preview {
        48.0
      } else if missing_image {
        52.0
      } else {
        0.0
      })
      + 18.0,
    color,
    font_family,
  );
  let mut details = Vec::new();
  if !field(topic, "notes").is_empty() {
    details.push("备注".to_owned())
  }
  if let Some(items) = topic["attachments"].as_array()
    && !items.is_empty()
  {
    details.push(format!("{} 个附件", items.len()))
  }
  if !include_collapsed
    && topic["collapsed"] == true
    && let Some(items) = topic["children"].as_array()
    && !items.is_empty()
  {
    details.push(format!("+{}", items.len()))
  }
  if !details.is_empty() {
    svg.text(
      &details.join(" · "),
      &[
        ("x", fmt(width / 2.0)),
        ("y", fmt(height - 10.0)),
        ("text-anchor", "middle".into()),
        ("font-size", "11".into()),
        ("fill", color.into()),
      ],
    );
  }
  let _ = marker_height;
  Ok(())
}

fn wrap(value: &str, font: f64, max_width: f64) -> Vec<String> {
  let mut lines = vec![String::new()];
  let mut width = 0.0;
  for ch in value.chars() {
    let size = if ch as u32 > 255 { font } else { font * 0.62 };
    if ch == '\n' || (width + size > max_width && width > 0.0) {
      lines.push(String::new());
      width = 0.0
    }
    if ch != '\n' {
      lines.last_mut().unwrap().push(ch);
      width += size
    }
  }
  lines
}
