use super::xmind_import::Warnings;
use serde_json::{Map, Value, json};

pub fn structure(value: Option<&Value>, warnings: &mut Warnings) -> Option<&'static str> {
  let value = value?.as_str()?;
  let result = match value {
    "org.xmind.ui.map" | "org.xmind.ui.map.unbalanced" => "map",
    "org.xmind.ui.logic.right" => "logic-right",
    "org.xmind.ui.logic.left" => "logic-left",
    "org.xmind.ui.org-chart.down" => "org-down",
    "org.xmind.ui.org-chart.up" => "org-up",
    "org.xmind.ui.timeline.horizontal" => "timeline",
    "org.xmind.ui.timeline.vertical" => "timeline-vertical",
    "org.xmind.ui.fishbone.leftHeaded" => "fishbone",
    _ => {
      warnings.add("不支持的 XMind 布局已使用继承或默认布局，主题内容已保留", 1);
      return None;
    }
  };
  Some(result)
}

pub fn parse_style(
  value: Option<&Value>,
  warnings: &mut Warnings,
) -> Result<Option<Value>, String> {
  let Some(value) = value else { return Ok(None) };
  let properties = value
    .get("properties")
    .and_then(Value::as_object)
    .ok_or("XMind style.properties 格式无效")?;
  let mut style = Map::new();
  for (raw, value) in properties {
    let key = raw.rsplit(':').next().unwrap_or(raw);
    let normalized = match key {
      "fill" | "color"
        if value.as_str().is_some_and(|s| {
          s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
        }) =>
      {
        Some((key.to_string(), value.clone()))
      }
      "font-size" => value
        .as_f64()
        .or_else(|| {
          value.as_str().and_then(|s| {
            s.strip_suffix("pt")
              .or_else(|| s.strip_suffix("px"))
              .unwrap_or(s)
              .parse::<f64>()
              .ok()
          })
        })
        .filter(|number| (12.0..=32.0).contains(number))
        .map(|number| ("fontSize".into(), json!(number))),
      "font-weight"
        if ["bold", "normal", "400", "700"].contains(&value.as_str().unwrap_or(""))
          || value == 400
          || value == 700 =>
      {
        Some((
          "bold".into(),
          json!(value == "bold" || value == "700" || value == 700),
        ))
      }
      "font-style" if value == "italic" || value == "normal" => {
        Some(("italic".into(), json!(value == "italic")))
      }
      "shape-class" => value
        .as_str()
        .and_then(|shape| match shape {
          "org.xmind.topicShape.roundedRect" => Some("rounded"),
          "org.xmind.topicShape.rect" => Some("rectangle"),
          "org.xmind.topicShape.ellipse" => Some("ellipse"),
          "org.xmind.topicShape.noShape" => Some("text"),
          "org.xmind.topicShape.diamond" => Some("diamond"),
          "org.xmind.topicShape.hexagon" => Some("hexagon"),
          "org.xmind.topicShape.cloud" => Some("cloud"),
          "org.xmind.topicShape.callout" => Some("speech"),
          _ => None,
        })
        .map(|shape| ("shape".into(), json!(shape))),
      _ => None,
    };
    if let Some((key, value)) = normalized {
      style.insert(key, value);
    } else {
      warnings.add("部分 XMind 样式不支持，已使用 Brainstorming 默认样式", 1);
    }
  }
  Ok(if style.is_empty() {
    None
  } else {
    Some(Value::Object(style))
  })
}

pub fn standard_metadata(
  source: &Map<String, Value>,
  warnings: &mut Warnings,
) -> Result<Option<Value>, String> {
  let mut metadata = Map::new();
  if let Some(markers) = source.get("markers") {
    let markers = markers.as_array().ok_or("XMind markers 必须是列表")?;
    if markers.len() > 128 {
      return Err("XMind 图标数量超过 128".into());
    }
    for marker in markers {
      let id = marker["markerId"].as_str().unwrap_or("");
      if id.len() == 10
        && id.starts_with("priority-")
        && id.as_bytes()[9].is_ascii_digit()
        && id.as_bytes()[9] != b'0'
      {
        if metadata.contains_key("task") {
          warnings.add("XMind 重复的优先级已跳过", 1);
        } else {
          metadata.insert("task".into(), json!({"priority":(id.as_bytes()[9]-b'0')}));
        }
      } else {
        warnings.add("未导入 XMind 图标", 1);
      }
    }
  }
  if let Some(labels) = source.get("labels") {
    if labels
      .as_array()
      .is_some_and(|values| values.iter().all(Value::is_string))
    {
      metadata.insert("labels".into(), labels.clone());
    } else {
      warnings.add("XMind 标签格式无效，已跳过", 1);
    }
  }
  if let Some(href) = source.get("href").and_then(Value::as_str)
    && ["https:", "http:", "mailto:"]
      .iter()
      .any(|prefix| href.to_ascii_lowercase().starts_with(prefix))
  {
    metadata.insert("link".into(), json!({"kind":"url","url":href}));
  }
  Ok(if metadata.is_empty() {
    None
  } else {
    Some(Value::Object(metadata))
  })
}

pub fn notes(value: Option<&Value>, warnings: &mut Warnings) -> Option<String> {
  let source = value?.as_object()?;
  let plain = source
    .get("plain")
    .and_then(|value| value.as_str().or_else(|| value["content"].as_str()));
  let content = if let Some(plain) = plain {
    plain.into()
  } else if let Some(rich) = ["html", "rich", "realHTML"]
    .iter()
    .find_map(|key| source.get(*key))
  {
    warnings.add("XMind 富文本备注已转为纯文本，格式未保留", 1);
    let markup = rich
      .as_str()
      .or_else(|| rich["content"].as_str())
      .unwrap_or("");
    if markup.len() > 1024 * 1024 || markup.to_ascii_lowercase().contains("<!doctype") {
      warnings.add("XMind 备注格式无效，已跳过", 1);
      return None;
    }
    strip_markup(markup)
  } else {
    warnings.add("XMind 备注格式无效，已跳过", 1);
    return None;
  };
  if (source.contains_key("html") || source.contains_key("rich") || source.contains_key("realHTML"))
    && plain.is_some()
  {
    warnings.add("XMind 富文本备注已转为纯文本，格式未保留", 1);
  }
  let mut content: String = content;
  if content.chars().count() > 100_000 {
    content = content.chars().take(100_000).collect();
    warnings.add("XMind 备注超过 100000 字符，已截断", 1);
  }
  Some(content)
}
fn strip_markup(source: &str) -> String {
  let mut text = String::new();
  let mut remaining = source;
  let mut skip = None;
  while !remaining.is_empty() {
    let Some(start) = remaining.find('<') else {
      if skip.is_none() {
        text.push_str(&html_text(remaining));
      }
      break;
    };
    if skip.is_none() {
      text.push_str(&html_text(&remaining[..start]));
    }
    let Some(end) = remaining[start..].find('>') else {
      break;
    };
    let tag = remaining[start + 1..start + end]
      .trim()
      .to_ascii_lowercase();
    let name = tag
      .trim_start_matches('/')
      .split_whitespace()
      .next()
      .unwrap_or("")
      .trim_end_matches('/');
    if ["script", "style"].contains(&name) {
      if tag.starts_with('/') {
        skip = None;
      } else {
        skip = Some(name.to_string());
      }
    } else if skip.is_none() {
      if name == "br" {
        text.push('\n');
      }
      if tag.starts_with('/') && ["p", "div", "li"].contains(&name) {
        text.push('\n');
      }
    }
    remaining = &remaining[start + end + 1..];
  }
  text.trim_end().to_string()
}
fn html_text(value: &str) -> String {
  quick_xml::escape::unescape(value)
    .map(|value| value.into_owned())
    .unwrap_or_else(|_| value.into())
}
