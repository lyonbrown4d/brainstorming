use super::{Result, error::invalid};
use serde_json::{Map, Value};
use std::collections::HashSet;
use unicode_segmentation::UnicodeSegmentation;

pub(crate) fn object(value: &Value) -> Result<&Map<String, Value>> {
  value.as_object().ok_or_else(|| invalid("文档对象结构无效"))
}
pub(crate) fn text(value: &Value) -> Result<&str> {
  value.as_str().ok_or_else(|| invalid("文档文本字段无效"))
}
pub(crate) fn id(value: &Value) -> Result<&str> {
  let value = text(value)?;
  if value.trim().is_empty()
    || value.len() > 4096
    || ["__proto__", "prototype", "constructor"].contains(&value)
  {
    return Err(invalid("文档标识无效"));
  }
  Ok(value)
}
pub(crate) fn list(value: &Value, maximum: usize) -> Result<&Vec<Value>> {
  let array = value.as_array().ok_or_else(|| invalid("文档列表无效"))?;
  if array.len() > maximum {
    return Err(invalid("文档列表超过限制"));
  }
  Ok(array)
}
pub(crate) fn keys(value: &Value, allowed: &[&str]) -> Result<()> {
  if object(value)?
    .keys()
    .any(|k| !allowed.contains(&k.as_str()))
  {
    return Err(invalid("文档包含当前版本不支持的字段"));
  }
  Ok(())
}
pub(crate) fn integer(value: &Value, min: u64, max: u64) -> Result<u64> {
  value
    .as_u64()
    .filter(|n| (min..=max).contains(n))
    .ok_or_else(|| invalid("文档整数超出范围"))
}

pub fn validate_workbook(workbook: &Value) -> Result<()> {
  keys(workbook, &["format", "version", "id", "title", "sheets"])?;
  if workbook["format"] != "brainstorming" || workbook["version"] != 2 {
    return Err(invalid("不支持此 Brainstorming 工作簿版本"));
  }
  id(&workbook["id"])?;
  text(&workbook["title"])?;
  if serde_json::to_vec(workbook)?.len() > 128 * 1024 * 1024 {
    return Err(invalid("文档元数据超过 128 MiB"));
  }
  let sheets = list(&workbook["sheets"], 128)?;
  if sheets.is_empty() {
    return Err(invalid("工作簿至少需要一个画布"));
  }
  let mut sheet_ids = HashSet::new();
  let mut count = 0;
  let mut objects = std::collections::HashMap::new();
  for sheet in sheets {
    keys(sheet, &["id", "name", "document"])?;
    if !sheet_ids.insert(id(&sheet["id"])?) {
      return Err(invalid("画布标识重复"));
    }
    let name = text(&sheet["name"])?;
    if name.trim().is_empty() || name.graphemes(true).count() > 80 {
      return Err(invalid("画布名称须为 1 至 80 个字符"));
    }
    validate_document(&sheet["document"])?;
    count += object(&sheet["document"]["topics"])?.len();
    if count > 20_000 {
      return Err(invalid("文档主题超过 20000 个限制"));
    }
    if let Some(assets) = sheet["document"]["assets"].as_object() {
      for asset in assets.values() {
        if let Some(storage) = asset.get("storage") {
          objects.insert(
            text(&storage["objectId"])?,
            integer(&storage["byteLength"], 0, 256 * 1024u64.pow(3))?,
          );
        }
      }
    }
  }
  if objects.values().sum::<u64>() > 256 * 1024u64.pow(3) {
    return Err(invalid("工作簿资源总量超过 256 GiB"));
  }
  for sheet in sheets {
    for topic in object(&sheet["document"]["topics"])?.values() {
      let link = &topic["metadata"]["link"];
      if link["kind"] != "topic" {
        continue;
      }
      let target = match link.get("sheetId") {
        Some(target) => sheets
          .iter()
          .find(|s| s["id"] == *target)
          .ok_or_else(|| invalid("链接引用的画布不存在"))?,
        None => sheet,
      };
      let target_id = id(&link["topicId"])?;
      if !object(&target["document"]["topics"])?.contains_key(target_id) {
        return Err(invalid("链接引用的主题不存在"));
      }
    }
  }
  Ok(())
}

fn validate_document(doc: &Value) -> Result<()> {
  keys(
    doc,
    &[
      "format",
      "version",
      "id",
      "title",
      "rootId",
      "topics",
      "assets",
      "settings",
      "relations",
      "groups",
      "callouts",
      "floatingIds",
      "floatingPositions",
      "presentation",
      "drawings",
    ],
  )?;
  if doc["format"] != "brainstorming" || doc["version"] != 1 {
    return Err(invalid("画布文档版本无效"));
  }
  id(&doc["id"])?;
  let root = id(&doc["rootId"])?;
  let title = text(&doc["title"])?;
  let topics = object(&doc["topics"])?;
  if topics.len() > 20_000 || topics.get(root).is_none() {
    return Err(invalid("主题数量无效或中心主题缺失"));
  }
  if topics[root]["title"] != title || topics[root]["side"] != "right" {
    return Err(invalid("中心主题属性与文档不一致"));
  }
  for (key, topic) in topics {
    id(&Value::String(key.clone()))?;
    keys(
      topic,
      &[
        "id",
        "title",
        "children",
        "collapsed",
        "side",
        "style",
        "notes",
        "image",
        "attachments",
        "metadata",
        "structure",
      ],
    )?;
    if topic["id"] != key.as_str()
      || !topic["collapsed"].is_boolean()
      || !["left", "right"].iter().any(|s| topic["side"] == *s)
    {
      return Err(invalid("主题属性无效"));
    }
    text(&topic["title"])?;
    if let Some(notes) = topic.get("notes")
      && text(notes)?.encode_utf16().count() > 100_000
    {
      return Err(invalid("主题备注超过限制"));
    }
    for child in list(&topic["children"], 20_000)? {
      id(child)?;
    }
    super::content_validation::topic(topic, doc)?;
  }
  let mut visited = HashSet::new();
  let mut pending = vec![(root, 1)];
  while let Some((current, depth)) = pending.pop() {
    if depth > 128 || !visited.insert(current) {
      return Err(invalid("主题层级过深、存在循环或父节点重复"));
    }
    let topic = topics
      .get(current)
      .ok_or_else(|| invalid("主题子节点不存在"))?;
    for child in list(&topic["children"], 20_000)? {
      let child = id(child)?;
      let next = topics
        .get(child)
        .ok_or_else(|| invalid("主题子节点不存在"))?;
      if current != root && next["side"] != topic["side"] {
        return Err(invalid("分支内主题方向不一致"));
      }
      pending.push((child, depth + 1));
    }
  }
  if visited.len() != topics.len() {
    return Err(invalid("文档包含不可达主题"));
  }
  super::content_validation::extensions(doc)?;
  if let Some(drawings) = doc.get("drawings") {
    super::drawing_validation::validate(drawings)?;
  }
  Ok(())
}
