use super::input::{Result, text};
use serde_json::Value;

pub fn endpoint(value: &str) -> Result<String> {
  if value.len() > 2048 || value.chars().any(char::is_control) {
    return Err("AI 服务地址无效".into());
  }
  let url = url::Url::parse(value).map_err(|_| "请输入完整 AI 服务地址")?;
  let local = matches!(
    url.host_str(),
    Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
  );
  let encoded = url.path().to_lowercase();
  if !(url.scheme() == "https" || (url.scheme() == "http" && local))
    || !url.username().is_empty()
    || url.password().is_some()
    || url.query().is_some()
    || url.fragment().is_some()
    || ["%2f", "%5c", "%00"].iter().any(|v| encoded.contains(v))
  {
    return Err("AI 地址须使用 HTTPS，本机服务可使用 HTTP；不可包含凭据、查询参数或片段".into());
  }
  Ok(url.as_str().trim_end_matches('/').to_string())
}
pub fn settings(value: &Value) -> Result<()> {
  let input = value.as_object().ok_or("AI 设置格式无效")?;
  if input.keys().any(|k| {
    ![
      "baseURL",
      "model",
      "apiKey",
      "clearKey",
      "rememberKey",
      "structuredOutputs",
    ]
    .contains(&k.as_str())
  }) {
    return Err("AI 设置包含未知字段".into());
  }
  endpoint(text(value, "baseURL", 2048)?)?;
  let model = text(value, "model", 480)?;
  if model.trim().is_empty()
    || model.encode_utf16().count() > 120
    || model.chars().any(char::is_control)
  {
    return Err("模型名称须为 1 至 120 个字符".into());
  }
  for key in ["rememberKey", "structuredOutputs"] {
    if !value[key].is_boolean() {
      return Err("AI 设置格式无效".into());
    }
  }
  if let Some(key) = value.get("apiKey") {
    let key = key.as_str().ok_or("API 密钥格式无效")?;
    if key.len() > 4096 || key.chars().any(char::is_control) {
      return Err("API 密钥格式无效".into());
    }
  }
  if value.get("clearKey").is_some_and(|v| !v.is_boolean()) {
    return Err("AI 设置格式无效".into());
  }
  Ok(())
}
pub fn request(value: &Value) -> Result<String> {
  let id = text(value, "requestId", 80)?;
  if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
    return Err("AI 请求标识无效".into());
  }
  if !matches!(
    value["mode"].as_str(),
    Some("generate" | "expand" | "organize")
  ) {
    return Err("AI 操作模式无效".into());
  }
  let prompt = text(value, "prompt", 16000)?;
  if prompt.trim().is_empty() || prompt.encode_utf16().count() > 4000 {
    return Err("AI 提示须为 1 至 4000 个字符".into());
  }
  let context = value["context"].as_array().ok_or("AI 分支内容格式无效")?;
  if context.len() > 200 || value["context"].to_string().encode_utf16().count() > 12000 {
    return Err("AI 分支上下文超过限制".into());
  }
  for topic in context {
    text(topic, "title", 48000)?;
    if !topic["depth"].as_u64().is_some_and(|v| v < 128)
      || topic.get("notes").is_some_and(|v| !v.is_string())
    {
      return Err("AI 分支内容格式无效".into());
    }
    if topic.as_object().is_none_or(|o| {
      o.keys()
        .any(|k| !["title", "notes", "depth"].contains(&k.as_str()))
    }) {
      return Err("AI 分支内容格式无效".into());
    }
  }
  if value.as_object().is_none_or(|o| {
    o.keys()
      .any(|k| !["requestId", "mode", "prompt", "context"].contains(&k.as_str()))
  }) {
    return Err("AI 请求包含未知字段".into());
  }
  Ok(id.to_string())
}
pub fn tree(value: &Value) -> Result<usize> {
  let mut pending = vec![(value, 1)];
  let mut count = 0;
  while let Some((node, depth)) = pending.pop() {
    count += 1;
    if count > 200 || depth > 8 {
      return Err("AI 结果超过 200 个主题或 8 层限制".into());
    }
    let title = text(node, "title", 800)?;
    let children = node["children"].as_array().ok_or("AI 主题格式无效")?;
    if title.trim().is_empty()
      || title.encode_utf16().count() > 200
      || children.len() > 32
      || node.as_object().is_none_or(|o| {
        o.keys()
          .any(|k| !["title", "children"].contains(&k.as_str()))
      })
    {
      return Err("AI 主题标题或子主题格式无效".into());
    }
    pending.extend(children.iter().map(|child| (child, depth + 1)));
  }
  Ok(count)
}
#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;
  #[test]
  fn bounds_outbound_destinations_and_generated_content() {
    assert!(endpoint("http://192.168.1.1/v1").is_err());
    assert!(endpoint("https://example.com/v1?key=secret").is_err());
    assert_eq!(
      endpoint("http://localhost:11434/v1/").unwrap(),
      "http://localhost:11434/v1"
    );
    assert_eq!(tree(&json!({"title":"Root","children":[]})).unwrap(), 1);
    assert!(tree(&json!({"title":"Root","children":[],"command":"rm"})).is_err());
    let children = vec![json!({"title":"Child","children":[]}); 33];
    assert!(tree(&json!({"title":"Root","children":children})).is_err());
  }
}
