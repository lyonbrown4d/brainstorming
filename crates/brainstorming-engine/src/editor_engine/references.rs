use super::helpers::*;
use serde_json::{Value, json};
use std::collections::HashSet;

pub(super) fn clear_floating(document: &mut Value, roots: &[String]) -> Result<(), String> {
  let Some(floating) = document.get("floatingIds") else {
    return Ok(());
  };
  let mut remaining = ids(floating)?;
  remaining.retain(|id| !roots.contains(id));
  document["floatingIds"] = json!(remaining);
  if let Some(positions) = document
    .get_mut("floatingPositions")
    .and_then(Value::as_object_mut)
  {
    positions.retain(|id, _| remaining.contains(id));
  }
  Ok(())
}

pub(super) fn prune_topics(
  document: &mut Value,
  initially_removed: &HashSet<String>,
) -> Result<(), String> {
  let mut removed = initially_removed.clone();
  if let Some(groups) = document["groups"].as_array() {
    for group in groups {
      if let Some(summary_id) = group["summaryTopicId"].as_str()
        && group["topicIds"].as_array().is_some_and(|members| {
          members
            .iter()
            .all(|id| id.as_str().is_some_and(|id| removed.contains(id)))
        })
      {
        removed.extend(subtree(document, summary_id)?);
      }
    }
  }
  for entry in object_mut(&mut document["topics"])?.values_mut() {
    array_mut(&mut entry["children"])?
      .retain(|child| !child.as_str().is_some_and(|id| removed.contains(id)));
  }
  object_mut(&mut document["topics"])?.retain(|id, _| !removed.contains(id));
  for entry in object_mut(&mut document["topics"])?.values_mut() {
    let Some(metadata) = entry.get_mut("metadata").and_then(Value::as_object_mut) else {
      continue;
    };
    if metadata.get("link").is_some_and(|link| {
      link["kind"] == "topic"
        && link.get("sheetId").is_none()
        && link["topicId"]
          .as_str()
          .is_some_and(|id| removed.contains(id))
    }) {
      metadata.remove("link");
    }
    if let Some(dependencies) = metadata
      .get_mut("task")
      .and_then(|task| task.get_mut("dependencies"))
      .and_then(Value::as_array_mut)
    {
      dependencies.retain(|id| !id.as_str().is_some_and(|id| removed.contains(id)));
    }
  }
  for key in ["relations", "groups", "callouts", "presentation"] {
    if let Some(values) = document.get_mut(key).and_then(Value::as_array_mut) {
      values.retain_mut(|entry| match key {
        "relations" => !["from", "to"]
          .iter()
          .any(|key| entry[*key].as_str().is_some_and(|id| removed.contains(id))),
        "groups" => {
          if let Some(ids) = entry["topicIds"].as_array_mut() {
            ids.retain(|id| !id.as_str().is_some_and(|id| removed.contains(id)));
          }
          entry["topicIds"]
            .as_array()
            .is_some_and(|ids| !ids.is_empty())
            && !entry["summaryTopicId"]
              .as_str()
              .is_some_and(|id| removed.contains(id))
        }
        "callouts" | "presentation" => !entry["topicId"]
          .as_str()
          .is_some_and(|id| removed.contains(id)),
        _ => true,
      });
    }
  }
  let root_children = ids(&topic(document, string(document, "rootId")?)?["children"])?;
  if let Some(floating) = document.get_mut("floatingIds") {
    array_mut(floating)?.retain(|id| {
      id.as_str()
        .is_some_and(|id| root_children.contains(&id.to_owned()))
    });
  }
  let floating = document
    .get("floatingIds")
    .map(ids)
    .transpose()?
    .unwrap_or_default();
  if let Some(positions) = document
    .get_mut("floatingPositions")
    .and_then(Value::as_object_mut)
  {
    positions.retain(|id, _| floating.contains(id));
  }
  Ok(())
}

pub(super) fn sanitize_summaries(document: &mut Value) -> Result<(), String> {
  let Some(groups) = document["groups"].as_array() else {
    return Ok(());
  };
  let mut replacements = Vec::new();
  for (index, group) in groups.iter().enumerate() {
    let Some(summary_id) = group["summaryTopicId"].as_str() else {
      continue;
    };
    let members = ids(&group["topicIds"])?;
    let invalid = document["rootId"] == summary_id
      || members.iter().any(|member| {
        if member == summary_id {
          return true;
        }
        subtree(document, member).is_ok_and(|ids| ids.contains(summary_id))
          || subtree(document, summary_id).is_ok_and(|ids| ids.contains(member))
      });
    if invalid {
      let mut replacement = group.clone();
      object_mut(&mut replacement)?.remove("summaryTopicId");
      if replacement.get("title").is_none() {
        replacement["title"] = document["topics"][summary_id]["title"].clone();
      }
      replacements.push((index, replacement));
    }
  }
  if let Some(groups) = document["groups"].as_array_mut() {
    for (index, replacement) in replacements {
      groups[index] = replacement;
    }
  }
  Ok(())
}
