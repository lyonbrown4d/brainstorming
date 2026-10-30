use serde_json::{Map, Value};
use std::collections::HashSet;

pub(super) fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value, String> {
  value.get(key).ok_or_else(|| format!("缺少字段 {key}"))
}

pub(super) fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
  field(value, key)?
    .as_str()
    .ok_or_else(|| format!("字段 {key} 必须是文本"))
}

pub(super) fn id(value: &Value, key: &str) -> Result<String, String> {
  let text = string(value, key)?;
  if text.trim().is_empty()
    || text.len() > 4096
    || ["__proto__", "prototype", "constructor"].contains(&text)
  {
    return Err(format!("字段 {key} 标识无效"));
  }
  Ok(text.to_owned())
}

pub(super) fn object(value: &Value) -> Result<&Map<String, Value>, String> {
  value.as_object().ok_or_else(|| "对象结构无效".to_owned())
}

pub(super) fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, String> {
  value
    .as_object_mut()
    .ok_or_else(|| "对象结构无效".to_owned())
}

pub(super) fn array(value: &Value) -> Result<&Vec<Value>, String> {
  value.as_array().ok_or_else(|| "列表结构无效".to_owned())
}

pub(super) fn array_mut(value: &mut Value) -> Result<&mut Vec<Value>, String> {
  value
    .as_array_mut()
    .ok_or_else(|| "列表结构无效".to_owned())
}

pub(super) fn ids(value: &Value) -> Result<Vec<String>, String> {
  array(value)?
    .iter()
    .map(|entry| {
      let id = entry
        .as_str()
        .ok_or_else(|| "主题 ID 列表无效".to_owned())?;
      if id.is_empty() {
        return Err("主题 ID 为空".to_owned());
      }
      Ok(id.to_owned())
    })
    .collect()
}

pub(super) fn index(command: &Value, length: usize) -> Result<usize, String> {
  match command.get("index") {
    None => Ok(length),
    Some(value) => value
      .as_u64()
      .and_then(|index| usize::try_from(index).ok())
      .filter(|index| *index <= length)
      .ok_or_else(|| "插入位置超出范围".to_owned()),
  }
}

pub(super) fn topic<'a>(document: &'a Value, topic_id: &str) -> Result<&'a Value, String> {
  document["topics"]
    .get(topic_id)
    .ok_or_else(|| format!("主题 {topic_id} 不存在"))
}

pub(super) fn topic_mut<'a>(
  document: &'a mut Value,
  topic_id: &str,
) -> Result<&'a mut Value, String> {
  document["topics"]
    .get_mut(topic_id)
    .ok_or_else(|| format!("主题 {topic_id} 不存在"))
}

pub(super) fn parent_id(document: &Value, topic_id: &str) -> Result<String, String> {
  if document["rootId"] == topic_id {
    return Err("不能修改中心主题的结构".to_owned());
  }
  for (id, entry) in object(&document["topics"])? {
    if ids(&entry["children"])?
      .iter()
      .any(|child| child == topic_id)
    {
      return Ok(id.clone());
    }
  }
  Err(format!("主题 {topic_id} 没有父主题"))
}

pub(super) fn subtree(document: &Value, root: &str) -> Result<HashSet<String>, String> {
  topic(document, root)?;
  let mut result = HashSet::new();
  let mut pending = vec![root.to_owned()];
  while let Some(id) = pending.pop() {
    if !result.insert(id.clone()) {
      continue;
    }
    pending.extend(ids(&topic(document, &id)?["children"])?);
  }
  Ok(result)
}

pub(super) fn side(
  document: &Value,
  parent_id: &str,
  requested: Option<&Value>,
) -> Result<String, String> {
  let parent = topic(document, parent_id)?;
  let parent_side = string(parent, "side")?;
  let desired = requested.and_then(Value::as_str);
  if requested.is_some() && !matches!(desired, Some("left" | "right")) {
    return Err("主题方向无效".to_owned());
  }
  if document["rootId"] != parent_id {
    if desired.is_some_and(|value| value != parent_side) {
      return Err("子主题必须继承父分支方向".to_owned());
    }
    return Ok(parent_side.to_owned());
  }
  Ok(
    desired
      .unwrap_or_else(|| {
        if parent["children"]
          .as_array()
          .is_some_and(|children| children.len() % 2 == 0)
        {
          "right"
        } else {
          "left"
        }
      })
      .to_owned(),
  )
}

pub(super) fn upsert(document: &mut Value, key: &str, value: Value) -> Result<(), String> {
  let id = id(&value, "id")?;
  let values = document
    .as_object_mut()
    .ok_or("文档无效")?
    .entry(key)
    .or_insert_with(|| Value::Array(Vec::new()));
  let values = array_mut(values)?;
  if let Some(index) = values.iter().position(|item| item["id"] == id) {
    values[index] = value;
  } else {
    values.push(value);
  }
  Ok(())
}

pub(super) fn remove_entry(
  document: &mut Value,
  key: &str,
  id: &str,
) -> Result<Option<Value>, String> {
  let Some(values) = document.get_mut(key) else {
    return Ok(None);
  };
  let values = array_mut(values)?;
  Ok(
    values
      .iter()
      .position(|entry| entry["id"] == id)
      .map(|index| values.remove(index)),
  )
}
