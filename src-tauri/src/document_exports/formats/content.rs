use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::Value;
use std::{collections::HashSet, io::Cursor, sync::Arc};

pub(crate) const MAX_BYTES: usize = 128 * 1024 * 1024;
pub(crate) const MAX_TOPICS: usize = 50_000;

pub(crate) fn text<'a>(value: &'a Value, key: &str) -> &'a str {
  value[key].as_str().unwrap_or("")
}

pub(crate) fn escape(value: &str) -> String {
  quick_xml::escape::escape(value).into_owned()
}

pub(crate) fn bounded(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
  if bytes.len() > MAX_BYTES {
    Err("导出内容超过 128 MiB 限制".into())
  } else {
    Ok(bytes)
  }
}

/// Iterative traversal retains document order, floating branches and collapsed content.
pub(crate) fn ordered_topics(document: &Value) -> Result<Vec<(&Value, usize)>, String> {
  let topics = document["topics"].as_object().ok_or("导出缺少主题")?;
  if topics.len() > MAX_TOPICS {
    return Err("导出主题超过 50000 个限制".into());
  }
  let mut pending: Vec<(&str, usize)> = document["floatingIds"]
    .as_array()
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
    .rev()
    .map(|id| (id, 0))
    .collect();
  pending.push((text(document, "rootId"), 0));
  let mut result = Vec::new();
  let mut seen = HashSet::new();
  while let Some((id, depth)) = pending.pop() {
    if !seen.insert(id) {
      continue;
    }
    let topic = topics.get(id).ok_or("导出缺少主题")?;
    result.push((topic, depth));
    for child in topic["children"].as_array().into_iter().flatten().rev() {
      pending.push((child.as_str().ok_or("导出主题顺序无效")?, depth + 1));
    }
  }
  Ok(result)
}

#[derive(Debug)]
pub(crate) struct Picture {
  pub png: Vec<u8>,
  pub width: u32,
  pub height: u32,
  pub name: String,
}

/// Only hydrated, bounded raster data enters Office packages and generated SVGs.
pub(crate) fn picture(document: &Value, topic: &Value) -> Result<Option<Arc<Picture>>, String> {
  let Some(id) = topic["image"]["assetId"].as_str() else {
    return Ok(None);
  };
  let asset = document["assets"].get(id).ok_or("导出缺少图片资源")?;
  let encoded = asset["data"].as_str().ok_or("导出图片尚未加载")?;
  if encoded.len() > 32 * 1024 * 1024 {
    return Err("导出单张图片超过 24 MiB 限制".into());
  }
  let bytes = STANDARD.decode(encoded).map_err(|_| "导出图片编码无效")?;
  let mut reader = image::ImageReader::new(Cursor::new(bytes))
    .with_guessed_format()
    .map_err(|_| "导出图片格式无效")?;
  let mut limits = image::Limits::default();
  limits.max_image_width = Some(8192);
  limits.max_image_height = Some(8192);
  limits.max_alloc = Some(24 * 1024 * 1024);
  reader.limits(limits);
  let decoded = reader.decode().map_err(|_| "导出图片损坏或超过尺寸限制")?;
  if u64::from(decoded.width()) * u64::from(decoded.height()) > 6_291_456 {
    return Err("导出图片超过 600 万像素限制".into());
  }
  let mut png = Cursor::new(Vec::new());
  decoded
    .write_to(&mut png, image::ImageFormat::Png)
    .map_err(|_| "导出图片转换失败")?;
  Ok(Some(Arc::new(Picture {
    png: png.into_inner(),
    width: decoded.width(),
    height: decoded.height(),
    name: text(asset, "name").into(),
  })))
}

pub(crate) fn safe_link(topic: &Value) -> Option<String> {
  let link = &topic["metadata"]["link"];
  if link["kind"] != "url" {
    return None;
  }
  let value = link["url"].as_str()?;
  let url = url::Url::parse(value).ok()?;
  matches!(url.scheme(), "http" | "https" | "mailto").then(|| url.to_string())
}

/// Office and SVG use XML 1.0, whose disallowed control characters cannot be escaped.
pub(crate) fn xml_safe(value: &Value) -> Result<(), String> {
  let mut pending = vec![value];
  while let Some(value) = pending.pop() {
    match value {
      Value::String(text)
        if text
          .chars()
          .any(|ch| ch < ' ' && !matches!(ch, '\t' | '\n' | '\r')) =>
      {
        return Err("导出内容包含 XML 不支持的控制字符".into());
      }
      Value::Array(items) => pending.extend(items),
      Value::Object(items) => pending.extend(items.values()),
      _ => {}
    }
  }
  Ok(())
}
