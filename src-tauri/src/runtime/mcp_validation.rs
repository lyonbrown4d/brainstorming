use super::input::{self, Result};
use serde_json::{Value, json};
fn id(value: &Value) -> Result<()> {
  let id = value.as_str().ok_or("ID 无效")?;
  if id.is_empty()
    || id.encode_utf16().count() > 160
    || ["__proto__", "constructor", "prototype"].contains(&id)
  {
    return Err("ID 无效".into());
  }
  Ok(())
}
fn strict(value: &Value, keys: &[&str]) -> Result<()> {
  if value
    .as_object()
    .is_none_or(|v| v.keys().any(|k| !keys.contains(&k.as_str())))
  {
    return Err("MCP 请求包含未知字段".into());
  }
  Ok(())
}
pub fn grant(value: &Value) -> Result<Value> {
  strict(value, &["workbookId", "includeNotes", "allowProposals"])?;
  id(&value["workbookId"])?;
  if !value["includeNotes"].is_boolean() || !value["allowProposals"].is_boolean() {
    return Err("MCP 授权格式无效".into());
  }
  Ok(value.clone())
}
pub fn action(name: &str, mut input: Value, proposals: bool) -> Result<Value> {
  match name {
    "get_workbook" => {
      strict(&input, &[])?;
      Ok(json!({"type":"workbook"}))
    }
    "read_branch" => {
      strict(
        &input,
        &["sheetId", "topicId", "offset", "limit", "revision"],
      )?;
      id(&input["sheetId"])?;
      if let Some(topic) = input.get("topicId") {
        id(topic)?;
      }
      for (key, default, min, max) in [("offset", 0, 0, 100000), ("limit", 100, 1, 200)] {
        if input.get(key).is_none() {
          input[key] = json!(default);
        }
        if !input[key].as_u64().is_some_and(|v| v >= min && v <= max) {
          return Err("分页范围无效".into());
        }
      }
      if let Some(revision) = input.get("revision")
        && revision.as_str().is_none_or(|v| v.len() > 80)
      {
        return Err("版本标识无效".into());
      }
      Ok(json!({"type":"read","input":input}))
    }
    "propose_edit" if proposals => {
      strict(&input, &["sheetId", "revision", "summary", "operations"])?;
      id(&input["sheetId"])?;
      if input::text(&input, "revision", 80)?.is_empty()
        || input::text(&input, "summary", 1200)?.trim().is_empty()
        || input["summary"]
          .as_str()
          .unwrap_or("")
          .encode_utf16()
          .count()
          > 300
      {
        return Err("草稿说明无效".into());
      }
      let operations = input["operations"]
        .as_array()
        .filter(|v| !v.is_empty() && v.len() <= 50)
        .ok_or("编辑操作须为 1 至 50 项")?;
      for operation in operations {
        validate_operation(operation)?;
      }
      Ok(json!({"type":"propose","input":input}))
    }
    "get_edit_status" if proposals => {
      strict(&input, &["proposalId"])?;
      let proposal = input::text(&input, "proposalId", 36)?;
      uuid::Uuid::parse_str(proposal).map_err(|_| "草稿标识无效")?;
      Ok(json!({"type":"proposalStatus","proposalId":proposal}))
    }
    _ => Err("MCP 工具未授权或不存在".into()),
  }
}
fn validate_operation(value: &Value) -> Result<()> {
  let kind = value["type"].as_str().ok_or("编辑操作无效")?;
  let keys: &[&str] = match kind {
    "addTopic" => &["type", "parentId", "id", "title"],
    "renameTopic" => &["type", "topicId", "title"],
    "moveTopic" => &["type", "topicId", "parentId", "index"],
    "deleteTopic" => &["type", "topicId"],
    "setTopicNotes" => &["type", "topicId", "notes"],
    _ => return Err("编辑操作无效".into()),
  };
  strict(value, keys)?;
  for key in keys
    .iter()
    .filter(|k| ["parentId", "topicId", "id"].contains(k))
  {
    id(&value[*key])?;
  }
  if keys.contains(&"title") {
    let title = input::text(value, "title", 800)?;
    if title.trim().is_empty() || title.encode_utf16().count() > 200 {
      return Err("主题标题无效".into());
    }
  }
  if kind == "setTopicNotes" && input::text(value, "notes", 48000)?.encode_utf16().count() > 12000 {
    return Err("主题备注过长".into());
  }
  if let Some(index) = value.get("index")
    && !index.as_u64().is_some_and(|v| v <= 10000)
  {
    return Err("主题排序无效".into());
  }
  Ok(())
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn proposal_grants_and_operations_are_checked_by_host() {
    let input = json!({"sheetId":"sheet","revision":"r1","summary":"Add","operations":[{"type":"addTopic","parentId":"root","id":"child","title":"Child"}]});
    assert!(action("propose_edit", input.clone(), false).is_err());
    assert!(action("propose_edit", input, true).is_ok());
    assert!(action("read_branch", json!({"sheetId":"__proto__"}), false).is_err());
    assert!(action("read_branch", json!({"sheetId":"sheet","limit":201}), false).is_err());
  }
}
