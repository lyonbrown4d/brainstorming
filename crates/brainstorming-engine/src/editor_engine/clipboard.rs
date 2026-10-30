use super::helpers::*;
use serde_json::{Value, json};
use std::collections::HashSet;

fn mapped(mapping: &Value, source: &str) -> Result<String, String> {
  mapping
    .get(source)
    .and_then(Value::as_str)
    .map(str::to_owned)
    .ok_or_else(|| "剪贴板 ID 映射不完整".to_owned())
}

fn check_mapping(source: &Value, mapping: &Value, existing: &Value) -> Result<(), String> {
  let source = object(source)?;
  let mapping = object(mapping)?;
  if source.len() != mapping.len() {
    return Err("剪贴板 ID 映射不完整".to_owned());
  }
  let mut targets = HashSet::new();
  for id in source.keys() {
    let target = mapping
      .get(id)
      .and_then(Value::as_str)
      .ok_or("剪贴板 ID 映射不完整")?
      .to_owned();
    if target.is_empty() || existing.get(&target).is_some() || !targets.insert(target) {
      return Err("剪贴板 ID 映射存在冲突".to_owned());
    }
  }
  Ok(())
}

fn remap_metadata(topic: &mut Value, topics: &Value, assets: &Value) -> Result<(), String> {
  let Some(metadata) = topic.get_mut("metadata") else {
    return Ok(());
  };
  if let Some(link) = metadata.get_mut("link")
    && link["kind"] == "topic"
    && link.get("sheetId").is_none()
  {
    let source = string(link, "topicId")?;
    link["topicId"] = json!(mapped(topics, source)?);
  }
  if let Some(dependencies) = metadata
    .get_mut("task")
    .and_then(|task| task.get_mut("dependencies"))
  {
    let old = ids(dependencies)?;
    *dependencies = json!(
      old
        .iter()
        .map(|id| mapped(topics, id))
        .collect::<Result<Vec<_>, _>>()?
    );
  }
  if let Some(audio) = metadata.get_mut("audioAssetId") {
    let old = audio.as_str().ok_or("音频资源 ID 无效")?.to_owned();
    *audio = json!(mapped(assets, &old)?);
  }
  Ok(())
}

pub(super) fn paste(document: &mut Value, command: &Value) -> Result<(), String> {
  let clipboard = field(command, "clipboard")?;
  if clipboard["format"] != "brainstorming.topics" || clipboard["version"] != 1 {
    return Err("主题剪贴板格式无效".to_owned());
  }
  let parent_id = id(command, "parentId")?;
  let parent = topic(document, &parent_id)?;
  let root_id = string(document, "rootId")?.to_owned();
  let parent_side = string(parent, "side")?.to_owned();
  let topic_mapping = field(command, "topicIds")?;
  let asset_mapping = field(command, "assetIds")?;
  check_mapping(
    field(clipboard, "topics")?,
    topic_mapping,
    &document["topics"],
  )?;
  check_mapping(
    clipboard.get("assets").unwrap_or(&json!({})),
    asset_mapping,
    &document["assets"],
  )?;
  let roots = ids(field(clipboard, "roots")?)?;
  if roots.is_empty() {
    return Err("剪贴板根主题不存在".to_owned());
  }
  for root in &roots {
    if clipboard["topics"].get(root).is_none() {
      return Err("主题剪贴板缺少根主题".to_owned());
    }
  }
  let mut assets = document.get("assets").cloned().unwrap_or_else(|| json!({}));
  if let Some(source_assets) = clipboard["assets"].as_object() {
    for (source_id, asset) in source_assets {
      let target = mapped(asset_mapping, source_id)?;
      let mut copy = asset.clone();
      copy["id"] = json!(target);
      object_mut(&mut assets)?.insert(target, copy);
    }
  }
  let mut topics = document["topics"].clone();
  let source_topics = object(&clipboard["topics"])?;
  for root in &roots {
    let branch_side = if parent_id == root_id {
      string(source_topics.get(root).ok_or("剪贴板缺少根主题")?, "side")?.to_owned()
    } else {
      parent_side.clone()
    };
    for source_id in subtree_clipboard(source_topics, root)? {
      let mut copy = source_topics
        .get(&source_id)
        .ok_or("剪贴板缺少子主题")?
        .clone();
      let target = mapped(topic_mapping, &source_id)?;
      copy["id"] = json!(target);
      copy["side"] = json!(branch_side);
      let children = ids(&copy["children"])?;
      copy["children"] = json!(
        children
          .iter()
          .map(|id| mapped(topic_mapping, id))
          .collect::<Result<Vec<_>, _>>()?
      );
      remap_metadata(&mut copy, topic_mapping, asset_mapping)?;
      if let Some(image) = copy.get_mut("image") {
        let source_asset = string(image, "assetId")?.to_owned();
        image["assetId"] = json!(mapped(asset_mapping, &source_asset)?);
      }
      if let Some(attachments) = copy.get_mut("attachments") {
        *attachments = json!(
          ids(attachments)?
            .iter()
            .map(|id| mapped(asset_mapping, id))
            .collect::<Result<Vec<_>, _>>()?
        );
      }
      object_mut(&mut topics)?.insert(target, copy);
    }
  }
  let new_roots = roots
    .iter()
    .map(|id| mapped(topic_mapping, id))
    .collect::<Result<Vec<_>, _>>()?;
  let parent = topics.get_mut(&parent_id).ok_or("父主题不存在")?;
  array_mut(&mut parent["children"])?.extend(new_roots.iter().map(|id| json!(id)));
  parent["collapsed"] = json!(false);
  document["topics"] = topics;
  if !object(&assets)?.is_empty() {
    document["assets"] = assets;
  }
  paste_annotations(
    document,
    clipboard,
    topic_mapping,
    command.get("annotationIds"),
    &new_roots[0],
  )?;
  Ok(())
}

fn subtree_clipboard(
  topics: &serde_json::Map<String, Value>,
  root: &str,
) -> Result<Vec<String>, String> {
  let mut pending = vec![root.to_owned()];
  let mut result = Vec::new();
  let mut visited = HashSet::new();
  while let Some(id) = pending.pop() {
    if !visited.insert(id.clone()) || visited.len() > 20_000 {
      return Err("剪贴板主题存在循环或超过数量限制".into());
    }
    let topic = topics.get(&id).ok_or("剪贴板缺少子主题")?;
    result.push(id);
    pending.extend(ids(&topic["children"])?);
  }
  Ok(result)
}

fn paste_annotations(
  document: &mut Value,
  clipboard: &Value,
  topic_ids: &Value,
  explicit: Option<&Value>,
  first_root: &str,
) -> Result<(), String> {
  let mut occupied = HashSet::new();
  for key in ["relations", "groups", "callouts"] {
    if let Some(items) = document[key].as_array() {
      for item in items {
        occupied.insert(id(item, "id")?);
      }
    }
  }
  let mut mapping = serde_json::Map::new();
  let mut count = 0;
  for key in ["relations", "groups", "callouts"] {
    let Some(items) = clipboard[key].as_array() else {
      continue;
    };
    for item in items {
      count += 1;
      let source = id(item, "id")?;
      let base = explicit
        .map(|ids| mapped(ids, &source))
        .transpose()?
        .unwrap_or_else(|| format!("copy-{first_root}-{source}"));
      let mut target = base.clone();
      if explicit.is_none() {
        let mut suffix = 1;
        while occupied.contains(&target) {
          target = format!("{base}-{suffix}");
          suffix += 1;
        }
      }
      if !occupied.insert(target.clone()) {
        return Err("剪贴板批注 ID 映射冲突".to_owned());
      }
      mapping.insert(source, json!(target));
    }
  }
  if explicit.is_some_and(|ids| ids.as_object().is_none_or(|ids| ids.len() != count)) {
    return Err("剪贴板批注 ID 映射不完整".to_owned());
  }
  for key in ["relations", "groups", "callouts"] {
    let Some(items) = clipboard[key].as_array() else {
      continue;
    };
    for item in items {
      let mut copy = item.clone();
      copy["id"] = mapping
        .get(&id(item, "id")?)
        .ok_or("批注映射不完整")?
        .clone();
      match key {
        "relations" => {
          for field in ["from", "to"] {
            copy[field] = json!(mapped(topic_ids, string(item, field)?)?);
          }
        }
        "groups" => {
          copy["topicIds"] = json!(
            ids(&item["topicIds"])?
              .iter()
              .map(|id| mapped(topic_ids, id))
              .collect::<Result<Vec<_>, _>>()?
          );
          if let Some(id) = item["summaryTopicId"].as_str() {
            copy["summaryTopicId"] = json!(mapped(topic_ids, id)?);
          }
        }
        "callouts" => copy["topicId"] = json!(mapped(topic_ids, string(item, "topicId")?)?),
        _ => unreachable!(),
      }
      let values = document
        .as_object_mut()
        .ok_or("文档无效")?
        .entry(key)
        .or_insert_with(|| json!([]));
      array_mut(values)?.push(copy);
    }
  }
  Ok(())
}
