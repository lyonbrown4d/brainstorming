use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};

pub struct Assets<'a> {
  entries: &'a HashMap<String, Vec<u8>>,
  used: &'a mut HashSet<String>,
  budget: &'a mut usize,
  paths: HashMap<String, String>,
  pub values: Map<String, Value>,
}

impl<'a> Assets<'a> {
  pub fn new(
    entries: &'a HashMap<String, Vec<u8>>,
    used: &'a mut HashSet<String>,
    budget: &'a mut usize,
  ) -> Self {
    Self {
      entries,
      used,
      budget,
      paths: HashMap::new(),
      values: Map::new(),
    }
  }

  pub fn resource(
    &mut self,
    source: &Value,
    image: bool,
    name: Option<&Value>,
    mime: Option<&Value>,
  ) -> Result<Option<Value>, String> {
    let Some(path) = source.as_str().and_then(path) else {
      return Ok(None);
    };
    let Some(bytes) = self.entries.get(&path) else {
      return Ok(None);
    };
    if bytes.len() > 8 * 1024 * 1024 {
      return Ok(None);
    }
    let existing = self
      .paths
      .get(&path)
      .and_then(|id| self.values.get(id))
      .cloned();
    let mut asset = if let Some(existing) = existing {
      existing
    } else {
      if *self.budget + bytes.len() > 24 * 1024 * 1024 {
        return Ok(None);
      }
      let id = format!("xmind-asset-{}", self.paths.len() + 1);
      let source_name = path.rsplit('/').next().unwrap_or("附件");
      json!({"id":id, "name":safe_name(source_name), "mimeType":sniff_mime(bytes), "data":STANDARD.encode(bytes)})
    };
    if let Some(name) = name {
      asset["name"] = json!(safe_name(name.as_str().ok_or("XMind 资源名称无效")?));
    }
    if let Some(mime) = mime {
      asset["mimeType"] = json!(mime.as_str().ok_or("XMind 资源 MIME 类型无效")?);
    }
    if image
      && (!["image/png", "image/jpeg", "image/gif", "image/webp"].contains(&sniff_mime(bytes))
        || dimensions(bytes).is_none())
    {
      return Ok(None);
    }
    let id = asset["id"]
      .as_str()
      .ok_or("XMind 资源标识无效")?
      .to_string();
    if !self.paths.contains_key(&path) {
      *self.budget += bytes.len();
    }
    self.paths.insert(path.clone(), id.clone());
    self.values.insert(id, asset.clone());
    self.used.insert(path);
    Ok(Some(asset))
  }

  pub fn image_size(&self, asset: &Value) -> Option<(usize, usize)> {
    let bytes = STANDARD.decode(asset["data"].as_str()?).ok()?;
    dimensions(&bytes)
  }
}

fn path(value: &str) -> Option<String> {
  let raw = value.strip_prefix("xap:").unwrap_or(value);
  let mut bytes = Vec::new();
  let mut source = raw.as_bytes().iter().copied();
  while let Some(byte) = source.next() {
    if byte == b'%' {
      let first = (source.next()? as char).to_digit(16)?;
      let second = (source.next()? as char).to_digit(16)?;
      bytes.push((first * 16 + second) as u8);
    } else {
      bytes.push(byte);
    }
  }
  let path = String::from_utf8(bytes).ok()?;
  if !(path.to_ascii_lowercase().starts_with("resources/")
    || path.to_ascii_lowercase().starts_with("attachments/"))
    || path.contains(['\\', '\0', ':', '?', '#'])
    || path
      .split('/')
      .any(|part| part.is_empty() || part == "." || part == "..")
  {
    return None;
  }
  Some(path)
}

pub fn safe_name(name: &str) -> String {
  let base = name.rsplit(['/', '\\']).next().unwrap_or("");
  let mut cleaned = String::new();
  for ch in base.chars() {
    let ch = if ch.is_control() || "<>:\"|?*".contains(ch) {
      '_'
    } else {
      ch
    };
    if cleaned.len() + ch.len_utf8() > 200 {
      break;
    }
    cleaned.push(ch);
  }
  let cleaned = cleaned.trim().trim_end_matches(['.', ' ']);
  if cleaned.is_empty() {
    "未命名附件".into()
  } else if ["con", "prn", "aux", "nul", "com1", "lpt1"]
    .contains(&cleaned.to_ascii_lowercase().as_str())
  {
    format!("_{cleaned}")
  } else {
    cleaned.into()
  }
}

fn sniff_mime(bytes: &[u8]) -> &'static str {
  if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
    "image/png"
  } else if bytes.starts_with(b"\xff\xd8\xff") {
    "image/jpeg"
  } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
    "image/gif"
  } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
    "image/webp"
  } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") {
    "audio/wav"
  } else {
    "application/octet-stream"
  }
}

fn dimensions(bytes: &[u8]) -> Option<(usize, usize)> {
  let size = imagesize::blob_size(bytes).ok()?;
  let width = size.width;
  let height = size.height;
  if width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 40_000_000 {
    return None;
  }
  Some((width, height))
}
