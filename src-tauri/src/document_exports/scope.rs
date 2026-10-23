use super::{ExportContent, ExportScope, Request, Result};
use serde_json::{Value, json};
use std::collections::HashSet;

pub fn select(request: &Request) -> Result<Value> {
  crate::document::validate_workbook(&request.workbook).map_err(|error| error.to_string())?;
  if request.sheet_ids.is_empty()
    || request.sheet_ids.len() > 128
    || request.topic_ids.len() > 20_000
    || request.drawing_ids.len() > 20_000
  {
    return Err("请选择需要导出的画布或主题".into());
  }
  let mut workbook = request.workbook.clone();
  let ids: HashSet<_> = request.sheet_ids.iter().map(String::as_str).collect();
  if ids.len() != request.sheet_ids.len() {
    return Err("导出画布重复".into());
  }
  let sheets = workbook["sheets"].as_array_mut().ok_or("画布无效")?;
  sheets.retain(|sheet| sheet["id"].as_str().is_some_and(|id| ids.contains(id)));
  if sheets.len() != ids.len() {
    return Err("导出画布不存在".into());
  }
  let selection = !request.topic_ids.is_empty() || !request.drawing_ids.is_empty();
  if selection && (sheets.len() != 1 || request.content == ExportContent::Presentation) {
    return Err("选区导出仅支持一张画布".into());
  }
  for sheet in sheets {
    if selection {
      prune(&mut sheet["document"], request)?;
    }
    let doc = &mut sheet["document"];
    retain_resources(doc);
    if let Some(topics) = doc["topics"].as_object_mut() {
      for topic in topics.values_mut() {
        let link = &topic["metadata"]["link"];
        if link["kind"] == "topic"
          && link["sheetId"].as_str().is_some_and(|id| !ids.contains(id))
          && let Some(metadata) = topic.get_mut("metadata").and_then(Value::as_object_mut)
        {
          metadata.remove("link");
        }
      }
    }
  }
  // Transparency is a render option, never persisted as document settings.
  crate::document::validate_workbook(&workbook).map_err(|error| error.to_string())?;
  Ok(workbook)
}
fn prune(doc: &mut Value, request: &Request) -> Result<()> {
  for id in &request.drawing_ids {
    if !doc["drawings"]
      .as_array()
      .is_some_and(|drawings| drawings.iter().any(|stroke| stroke["id"] == *id))
    {
      return Err("选中笔迹不存在".into());
    }
  }
  let original = doc["topics"].as_object().ok_or("主题无效")?.clone();
  let mut keep: HashSet<String> = HashSet::new();
  let mut queue = request.topic_ids.clone();
  for id in &queue {
    if !original.contains_key(id) {
      return Err("选中主题不存在".into());
    }
  }
  while let Some(id) = queue.pop() {
    if !keep.insert(id.clone()) {
      continue;
    }
    if request.scope == ExportScope::Branch {
      queue.extend(
        original[&id]["children"]
          .as_array()
          .into_iter()
          .flatten()
          .filter_map(Value::as_str)
          .map(str::to_owned),
      );
    }
  }
  if keep.is_empty() {
    keep.insert(doc["rootId"].as_str().ok_or("缺少中心主题")?.into());
  }
  let children: HashSet<String> = keep
    .iter()
    .flat_map(|id| {
      original[id]["children"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
    })
    .filter(|id| keep.contains(id))
    .collect();
  let mut roots: Vec<String> = original
    .keys()
    .filter(|id| keep.contains(*id) && !children.contains(*id))
    .cloned()
    .collect();
  let old_root = doc["rootId"].as_str().unwrap_or("");
  let root = if keep.contains(old_root) {
    old_root.to_string()
  } else {
    roots.first().cloned().ok_or("选区主题无效")?
  };
  roots.retain(|id| id != &root);
  let mut topics = serde_json::Map::new();
  for (id, mut topic) in original {
    if !keep.contains(&id) {
      continue;
    }
    if let Some(children) = topic["children"].as_array_mut() {
      children.retain(|child| child.as_str().is_some_and(|id| keep.contains(id)));
    }
    if let Some(dependencies) = topic
      .get_mut("metadata")
      .and_then(|metadata| metadata.get_mut("task"))
      .and_then(|task| task.get_mut("dependencies"))
      .and_then(Value::as_array_mut)
    {
      dependencies.retain(|item| item.as_str().is_some_and(|id| keep.contains(id)));
    }
    if let Some(metadata) = topic.get_mut("metadata").and_then(Value::as_object_mut)
      && metadata
        .get("link")
        .is_some_and(|link| link["kind"] == "topic")
    {
      metadata.remove("link");
    }
    topics.insert(id, topic);
  }
  let mut floating = roots.clone();
  for previous in doc["floatingIds"]
    .as_array()
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
  {
    if previous != root && keep.contains(previous) && !floating.iter().any(|id| id == previous) {
      floating.push(previous.into());
    }
  }
  let center = topics.get_mut(&root).ok_or("选区缺少中心主题")?;
  let children = center["children"].as_array_mut().ok_or("选区主题无效")?;
  for id in &roots {
    if !children.iter().any(|child| child == id) {
      children.push(json!(id));
    }
  }
  center["side"] = json!("right");
  center["collapsed"] = json!(false);
  doc["title"] = center["title"].clone();
  doc["rootId"] = json!(root);
  doc["topics"] = json!(topics);
  doc["floatingIds"] = json!(floating);
  if let Some(positions) = doc
    .get_mut("floatingPositions")
    .and_then(Value::as_object_mut)
  {
    positions.retain(|id, _| floating.contains(id));
  }
  if let Some(relations) = doc.get_mut("relations").and_then(Value::as_array_mut) {
    relations.retain(|item| {
      item["from"].as_str().is_some_and(|id| keep.contains(id))
        && item["to"].as_str().is_some_and(|id| keep.contains(id))
    });
  }
  if let Some(groups) = doc.get_mut("groups").and_then(Value::as_array_mut) {
    groups.retain(|item| {
      item["topicIds"].as_array().is_some_and(|ids| {
        ids.iter().all(|id| {
          id.as_str()
            .is_some_and(|id| keep.contains(id) && id != root)
        })
      }) && item["summaryTopicId"]
        .as_str()
        .is_none_or(|id| keep.contains(id) && id != root)
    });
  }
  if let Some(callouts) = doc.get_mut("callouts").and_then(Value::as_array_mut) {
    callouts.retain(|item| item["topicId"].as_str().is_some_and(|id| keep.contains(id)));
  }
  doc.as_object_mut().unwrap().remove("presentation");
  if let Some(drawings) = doc.get_mut("drawings").and_then(Value::as_array_mut) {
    drawings.retain(|stroke| {
      stroke["id"]
        .as_str()
        .is_some_and(|id| request.drawing_ids.iter().any(|wanted| wanted == id))
    });
  }
  Ok(())
}

/// Exported subsets never carry resources belonging only to excluded topics.
fn retain_resources(document: &mut Value) {
  let mut ids = HashSet::new();
  for topic in document["topics"]
    .as_object()
    .into_iter()
    .flat_map(|topics| topics.values())
  {
    if let Some(id) = topic["image"]["assetId"].as_str() {
      ids.insert(id.to_string());
    }
    if let Some(id) = topic["metadata"]["audioAssetId"].as_str() {
      ids.insert(id.to_string());
    }
    for id in topic["attachments"]
      .as_array()
      .into_iter()
      .flatten()
      .filter_map(Value::as_str)
    {
      ids.insert(id.to_string());
    }
  }
  if let Some(assets) = document.get_mut("assets").and_then(Value::as_object_mut) {
    assets.retain(|id, _| ids.contains(id));
  }
}
