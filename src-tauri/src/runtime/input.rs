use serde_json::Value;
use std::path::{Path, PathBuf};

pub type Result<T> = std::result::Result<T, String>;
pub const MAX_DOCUMENT: usize = 128 * 1024 * 1024;
pub fn text<'a>(value: &'a Value, key: &str, limit: usize) -> Result<&'a str> {
  value
    .get(key)
    .and_then(Value::as_str)
    .filter(|s| s.len() <= limit)
    .ok_or_else(|| format!("无效的 {key}"))
}
pub fn required<'a>(value: &'a Value, key: &str) -> Result<&'a Value> {
  value.get(key).ok_or_else(|| format!("缺少 {key}"))
}
pub fn identifier(value: &str) -> Result<()> {
  if value.trim().is_empty() || value.len() > 4096 || value.contains('\0') {
    return Err("文档标识无效".into());
  }
  Ok(())
}
pub fn password(value: &str, creating: bool) -> Result<()> {
  let length = value.encode_utf16().count();
  if length < if creating { 8 } else { 1 } || length > if creating { 128 } else { 1024 } {
    return Err("密码长度无效".into());
  }
  Ok(())
}
pub fn path(value: &str, save: bool) -> Result<PathBuf> {
  if value.is_empty() || value.len() > 4096 || value.contains('\0') {
    return Err("文件路径无效".into());
  }
  let path = PathBuf::from(value);
  let ext = path
    .extension()
    .and_then(|v| v.to_str())
    .unwrap_or("")
    .to_lowercase();
  if !path.is_absolute() || !(ext == "brainstorming" || (!save && ext == "xmind")) {
    return Err("请选择 .brainstorming 文件".into());
  }
  Ok(path)
}
pub fn workbook(contents: &str) -> Result<Value> {
  if contents.len() > MAX_DOCUMENT {
    return Err("文档内容超过 128 MiB".into());
  }
  let value: Value = serde_json::from_str(contents).map_err(|_| "文档 JSON 无效")?;
  identifier(workbook_id(&value)?)?;
  Ok(value)
}
pub fn workbook_id(value: &Value) -> Result<&str> {
  value
    .get("id")
    .and_then(Value::as_str)
    .ok_or_else(|| "工作簿标识无效".into())
}
pub fn safe_name(value: &str) -> String {
  let name = Path::new(value)
    .file_name()
    .and_then(|s| s.to_str())
    .unwrap_or("Brainstorming");
  let clean: String = name
    .chars()
    .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
    .take(240)
    .collect();
  if clean.trim().is_empty() {
    "Brainstorming".into()
  } else {
    clean
  }
}
pub fn bytes(value: &Value, limit: usize) -> Result<Vec<u8>> {
  let input = value
    .as_array()
    .filter(|v| v.len() <= limit)
    .ok_or("文件内容超过限制")?;
  input
    .iter()
    .map(|v| {
      v.as_u64()
        .filter(|n| *n <= 255)
        .map(|n| n as u8)
        .ok_or_else(|| "文件字节无效".into())
    })
    .collect()
}
pub fn external_url(value: &str) -> Result<String> {
  let url = url::Url::parse(value).map_err(|_| "链接无效")?;
  if value.len() > 4096
    || !["https", "http", "mailto"].contains(&url.scheme())
    || !url.username().is_empty()
    || url.password().is_some()
  {
    return Err("只支持安全的网页或邮件链接".into());
  }
  Ok(url.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn rejects_untrusted_paths_and_credentials() {
    assert!(path("relative.brainstorming", true).is_err());
    assert!(path("/tmp/map.xmind", true).is_err());
    assert!(external_url("https://secret@example.com").is_err());
    assert!(external_url("javascript:alert(1)").is_err());
    assert!(external_url("mailto:hello@example.com").is_ok());
    assert!(password("短密码", true).is_err());
    assert!(password("correct horse battery staple", true).is_ok());
  }
}
