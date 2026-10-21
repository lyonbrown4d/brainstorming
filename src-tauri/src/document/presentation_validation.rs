#[path = "relation_validation.rs"]
mod relation_validation;
#[path = "spatial_validation.rs"]
mod spatial_validation;
use super::{Result, error::invalid, validation::*};
use serde_json::Value;

const LAYOUTS: &[&str] = &[
  "map",
  "logic-right",
  "logic-left",
  "org-down",
  "org-up",
  "tree-down",
  "tree-up",
  "brace-right",
  "brace-left",
  "fishbone",
  "timeline",
  "timeline-vertical",
  "tree-table-right",
  "tree-table-down",
  "matrix",
];
pub(super) fn choice(value: &Value, choices: &[&str]) -> Result<()> {
  if !choices.contains(&text(value)?) {
    return Err(invalid("扩展枚举值无效"));
  }
  Ok(())
}
pub(super) fn number(value: &Value, min: f64, max: f64) -> Result<()> {
  if value
    .as_f64()
    .is_none_or(|n| !n.is_finite() || n < min || n > max)
  {
    return Err(invalid("扩展数值超出范围"));
  }
  Ok(())
}
pub(super) fn bounded_text(value: &Value, max: usize, empty: bool) -> Result<()> {
  let value = text(value)?;
  if value.encode_utf16().count() > max || (!empty && value.trim().is_empty()) {
    return Err(invalid("扩展文本长度无效"));
  }
  Ok(())
}
fn color(value: &Value) -> Result<()> {
  let color = text(value)?;
  if color.len() != 7
    || !color.starts_with('#')
    || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
  {
    return Err(invalid("颜色须为六位十六进制值"));
  }
  Ok(())
}
pub(super) fn optional(
  value: &Value,
  key: &str,
  validate: impl FnOnce(&Value) -> Result<()>,
) -> Result<()> {
  match value.get(key) {
    Some(value) => validate(value),
    None => Ok(()),
  }
}
pub(super) fn boolean(value: &Value) -> Result<()> {
  if !value.is_boolean() {
    return Err(invalid("扩展布尔值无效"));
  }
  Ok(())
}

pub(crate) fn topic(topic: &Value) -> Result<()> {
  optional(topic, "structure", |v| choice(v, LAYOUTS))?;
  optional(topic, "style", |style| {
    keys(
      style,
      &[
        "offsetX",
        "offsetY",
        "spatialDepth",
        "fill",
        "color",
        "fontSize",
        "width",
        "scale",
        "bold",
        "italic",
        "shape",
        "lineStyle",
        "lineWidth",
      ],
    )?;
    for key in ["fill", "color"] {
      optional(style, key, color)?;
    }
    for key in ["bold", "italic"] {
      optional(style, key, boolean)?;
    }
    for key in ["offsetX", "offsetY"] {
      optional(style, key, |v| number(v, -1_000_000., 1_000_000.))?;
    }
    optional(style, "spatialDepth", spatial_validation::validate_depth)?;
    optional(style, "fontSize", |v| number(v, 12., 32.))?;
    optional(style, "width", |v| number(v, 80., 1200.))?;
    optional(style, "scale", |v| number(v, 0.5, 3.))?;
    optional(style, "lineWidth", |v| number(v, 1., 6.))?;
    optional(style, "shape", |v| {
      choice(v, super::topic_shapes::TOPIC_SHAPES)
    })?;
    optional(style, "lineStyle", |v| choice(v, &["curve", "straight"]))
  })?;
  if let Some(metadata) = topic.get("metadata") {
    optional(metadata, "equation", |v| bounded_text(v, 10_000, true))?;
    optional(metadata, "richTitle", |v| bounded_text(v, 100_000, true))?;
    optional(metadata, "notesFormat", |v| {
      choice(v, &["plain", "markdown"])
    })?;
    optional(metadata, "markerStyle", |style| {
      keys(style, &["position", "size"])?;
      optional(style, "position", |v| {
        choice(v, &["top", "bottom", "left", "right"])
      })?;
      optional(style, "size", |v| integer(v, 12, 48).map(|_| ()))
    })?;
    if let Some(task) = metadata.get("task") {
      optional(task, "assignee", |v| bounded_text(v, 120, false))?;
      for field in ["start", "due"] {
        optional(task, field, |v| {
          let date = text(v)?;
          if date.len() != 10 || date.as_bytes()[4] != b'-' || date.as_bytes()[7] != b'-' {
            return Err(invalid("日期须使用 YYYY-MM-DD 格式"));
          }
          let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| invalid("日期须为有效 YYYY-MM-DD 格式"))?;
          if parsed.format("%Y-%m-%d").to_string() != date {
            return Err(invalid("日期格式无效"));
          }
          Ok(())
        })?;
      }
    }
  }
  Ok(())
}

#[cfg(test)]
#[path = "topic_width_tests.rs"]
mod topic_width_tests;

pub(crate) fn settings(doc: &Value) -> Result<()> {
  optional(doc, "settings", |settings| {
    keys(
      settings,
      &[
        "layout",
        "visualStyle",
        "theme",
        "customPalette",
        "background",
        "fontFamily",
        "lineWidth",
        "spatial",
      ],
    )?;
    optional(settings, "layout", |v| choice(v, LAYOUTS))?;
    optional(settings, "visualStyle", |v| {
      choice(v, &["normal", "sketch"])
    })?;
    optional(settings, "theme", |v| {
      choice(
        v,
        &[
          "brainstorming",
          "ocean",
          "forest",
          "sunset",
          "mono",
          "dawn",
          "paper",
          "night",
        ],
      )
    })?;
    optional(settings, "background", color)?;
    optional(settings, "lineWidth", |v| number(v, 1., 6.))?;
    optional(settings, "spatial", spatial_validation::validate)?;
    optional(settings, "fontFamily", |v| {
      bounded_text(v, 128, false)?;
      if text(v)?.chars().any(char::is_control) {
        return Err(invalid("字体名称包含控制字符"));
      }
      Ok(())
    })?;
    optional(settings, "customPalette", |palette| {
      keys(palette, &["name", "root", "branches", "background"])?;
      bounded_text(&palette["name"], 40, false)?;
      color(&palette["root"])?;
      color(&palette["background"])?;
      let branches = list(&palette["branches"], 5)?;
      if branches.len() != 5 {
        return Err(invalid("配色须包含五个分支颜色"));
      }
      for branch in branches {
        color(branch)?;
      }
      Ok(())
    })
  })
}

pub(crate) fn annotation(kind: &str, item: &Value) -> Result<()> {
  match kind {
    "relations" => relation_validation::validate(item)?,
    "groups" => {
      keys(
        item,
        &["id", "topicIds", "title", "kind", "color", "summaryTopicId"],
      )?;
      optional(item, "summaryTopicId", |value| {
        if item["kind"] != "summary" {
          return Err(invalid("只有概要可以关联概要主题"));
        }
        id(value).map(|_| ())
      })?;
      if list(&item["topicIds"], 512)?.is_empty() {
        return Err(invalid("分组至少需要一个主题"));
      }
    }
    "callouts" => {
      keys(item, &["id", "topicId", "text"])?;
      bounded_text(&item["text"], 10_000, false)?;
    }
    "presentation" => super::presentation_steps::validate(item)?,
    _ => return Err(invalid("批注类型无效")),
  }
  optional(item, "title", |v| bounded_text(v, 1000, true))?;
  optional(item, "color", color)
}

pub(crate) fn storage(storage: &Value) -> Result<()> {
  keys(
    storage,
    &[
      "objectId",
      "byteLength",
      "width",
      "height",
      "preview",
      "tiles",
    ],
  )?;
  integer(&storage["byteLength"], 0, 64 * 1024u64.pow(3))?;
  for field in ["width", "height"] {
    optional(storage, field, |v| integer(v, 1, 65_536).map(|_| ()))?;
  }
  optional(storage, "preview", |preview| {
    keys(
      preview,
      &["objectId", "mimeType", "byteLength", "width", "height"],
    )?;
    choice(
      &preview["mimeType"],
      &["image/webp", "image/png", "image/jpeg"],
    )?;
    integer(&preview["byteLength"], 1, 16 * 1024 * 1024)?;
    for field in ["width", "height"] {
      integer(&preview[field], 1, 8192)?;
    }
    Ok(())
  })?;
  optional(storage, "tiles", |tiles| {
    keys(
      tiles,
      &[
        "tileSize",
        "overlap",
        "maxLevel",
        "width",
        "height",
        "format",
        "pipelineVersion",
      ],
    )?;
    integer(&tiles["tileSize"], 128, 2048)?;
    integer(&tiles["overlap"], 0, 16)?;
    let width = integer(&tiles["width"], 1, 65_536)?;
    let height = integer(&tiles["height"], 1, 65_536)?;
    let level = integer(&tiles["maxLevel"], 0, 16)?;
    if tiles["format"] != "webp"
      || tiles["pipelineVersion"] != 1
      || level != (width.max(height) as f64).log2().ceil() as u64
    {
      return Err(invalid("图片瓦片信息无效"));
    }
    Ok(())
  })
}
