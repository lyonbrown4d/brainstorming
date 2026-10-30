use super::{helpers::*, topic_structural};
use serde_json::{Value, json};

pub(super) fn apply(document: &mut Value, command: &Value) -> Result<bool, String> {
  match string(command, "type")? {
    "setTopicMetadata" => {
      let topic_id = id(command, "topicId")?;
      let metadata = field(command, "metadata")?.clone();
      if object(&metadata)?.is_empty() {
        object_mut(topic_mut(document, &topic_id)?)?.remove("metadata");
      } else {
        topic_mut(document, &topic_id)?["metadata"] = metadata;
      }
    }
    "setTopicStructure" => {
      let topic_id = id(command, "topicId")?;
      if let Some(structure) = command.get("structure") {
        topic_mut(document, &topic_id)?["structure"] = structure.clone();
      } else {
        object_mut(topic_mut(document, &topic_id)?)?.remove("structure");
      }
    }
    "setDocumentSettings" => {
      let settings = field(command, "settings")?.clone();
      if object(&settings)?.is_empty() {
        object_mut(document)?.remove("settings");
      } else {
        document["settings"] = settings;
      }
    }
    "setPresentation" => {
      document["presentation"] = field(command, "steps")?.clone();
    }
    "upsertRelation" => upsert(document, "relations", field(command, "relation")?.clone())?,
    "upsertCallout" => upsert(document, "callouts", field(command, "callout")?.clone())?,
    "upsertGroup" => {
      let group = field(command, "group")?;
      validate_summary_range(document, group)?;
      upsert(document, "groups", group.clone())?;
    }
    "upsertDrawing" => upsert(document, "drawings", field(command, "stroke")?.clone())?,
    "removeRelation" => {
      remove_entry(document, "relations", &id(command, "relationId")?)?;
    }
    "removeCallout" => {
      remove_entry(document, "callouts", &id(command, "calloutId")?)?;
    }
    "removeDrawing" => {
      remove_entry(document, "drawings", &id(command, "drawingId")?)?;
    }
    "removeGroup" => {
      let group = remove_entry(document, "groups", &id(command, "groupId")?)?;
      if let Some(summary_id) =
        group.and_then(|group| group["summaryTopicId"].as_str().map(str::to_owned))
      {
        topic_structural::apply(
          document,
          &json!({"type":"deleteTopic","topicId":summary_id}),
        )?;
      }
    }
    "addFloatingTopic" => {
      let id = id(command, "id")?;
      if document["topics"].get(&id).is_some() {
        return Err("主题 ID 已存在".to_owned());
      }
      let title = string(command, "title")?.to_owned();
      let x = field(command, "x")?.as_f64().ok_or("游离主题位置无效")?;
      let y = field(command, "y")?.as_f64().ok_or("游离主题位置无效")?;
      if !x.is_finite() || !y.is_finite() {
        return Err("游离主题位置无效".to_owned());
      }
      let root_id = string(document, "rootId")?.to_owned();
      array_mut(&mut topic_mut(document, &root_id)?["children"])?.push(json!(id));
      topic_mut(document, &root_id)?["collapsed"] = json!(false);
      object_mut(&mut document["topics"])?.insert(
        id.clone(),
        json!({
          "id":id,"title":title,"children":[],"collapsed":false,"side":"right"
        }),
      );
      let floating = document
        .as_object_mut()
        .ok_or("文档无效")?
        .entry("floatingIds")
        .or_insert_with(|| json!([]));
      array_mut(floating)?.push(json!(id));
      document["floatingPositions"][id.as_str()] = json!({"x":x,"y":y});
    }
    "setFloatingPosition" => {
      let id = id(command, "topicId")?;
      topic(document, &id)?;
      if !document["floatingIds"]
        .as_array()
        .is_some_and(|ids| ids.contains(&json!(id)))
      {
        return Err("只能设置游离主题的位置".to_owned());
      }
      let x = field(command, "x")?.as_f64().ok_or("游离主题位置无效")?;
      let y = field(command, "y")?.as_f64().ok_or("游离主题位置无效")?;
      if !x.is_finite() || !y.is_finite() {
        return Err("游离主题位置无效".to_owned());
      }
      document["floatingPositions"][id.as_str()] = json!({"x":x,"y":y});
    }
    _ => return Ok(false),
  }
  Ok(true)
}

fn validate_summary_range(document: &Value, group: &Value) -> Result<(), String> {
  if group["kind"] != "summary" {
    return Ok(());
  }
  let members = ids(field(group, "topicIds")?)?;
  if members.is_empty() {
    return Err("概要范围为空".to_owned());
  }
  let prior = document["groups"]
    .as_array()
    .and_then(|groups| groups.iter().find(|old| old["id"] == group["id"]));
  let parent = parent_id(document, &members[0])?;
  if !prior.is_some_and(|old| old["topicIds"] == group["topicIds"]) {
    let floating = document["floatingIds"].as_array();
    let summary_roots = document["groups"].as_array();
    if members.iter().any(|member| {
      floating.is_some_and(|ids| ids.contains(&json!(member)))
        || summary_roots.is_some_and(|groups| {
          groups
            .iter()
            .any(|group| group["summaryTopicId"] == member.as_str())
        })
    }) {
      return Err("概要范围不能包含游离或概要主题".to_owned());
    }
    let siblings = ids(&topic(document, &parent)?["children"])?;
    let start = siblings
      .iter()
      .position(|id| id == &members[0])
      .ok_or("概要范围无效")?;
    if siblings.get(start..start + members.len()) != Some(members.as_slice()) {
      return Err("概要范围必须是连续的同级主题".to_owned());
    }
    let first_side = topic(document, &members[0])?["side"].clone();
    for member in &members {
      if parent_id(document, member)? != parent || topic(document, member)?["side"] != first_side {
        return Err("概要范围必须位于同一分支".to_owned());
      }
    }
  }
  if let Some(summary_id) = group["summaryTopicId"].as_str() {
    if parent_id(document, summary_id)? != parent {
      return Err("概要主题须与范围主题属于同一父主题".to_owned());
    }
    if document["groups"].as_array().is_some_and(|groups| {
      groups
        .iter()
        .any(|other| other["id"] != group["id"] && other["summaryTopicId"] == summary_id)
    }) {
      return Err("概要主题已被使用".to_owned());
    }
  }
  Ok(())
}
