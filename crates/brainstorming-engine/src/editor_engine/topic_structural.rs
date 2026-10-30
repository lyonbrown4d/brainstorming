use super::{clipboard, helpers::*, references};
use serde_json::{Value, json};
use std::collections::HashSet;

pub(super) fn apply(document: &mut Value, command: &Value) -> Result<bool, String> {
  match string(command, "type")? {
    "addTopic" => add(document, command)?,
    "addFloatingTopic" => return Ok(false),
    "insertParentTopic" => insert_parent(document, command)?,
    "removeTopicOnly" => remove_only(document, &id(command, "topicId")?)?,
    "deleteTopic" => delete(document, &[id(command, "topicId")?])?,
    "deleteTopics" => delete(document, &ids(field(command, "topicIds")?)?)?,
    "moveTopic" => move_topics(document, &[id(command, "topicId")?], command)?,
    "attachFloatingTopic" => {
      let topic_id = id(command, "topicId")?;
      if !document["floatingIds"]
        .as_array()
        .is_some_and(|ids| ids.contains(&json!(topic_id)))
      {
        return Err("主题不是游离主题".to_owned());
      }
      move_topics(document, &[topic_id], command)?;
    }
    "moveTopics" => move_topics(document, &ids(field(command, "topicIds")?)?, command)?,
    "pasteTopics" => clipboard::paste(document, command)?,
    _ => return Ok(false),
  }
  Ok(true)
}

fn add(document: &mut Value, command: &Value) -> Result<(), String> {
  let new_id = id(command, "id")?;
  if document["topics"].get(&new_id).is_some() {
    return Err("主题 ID 已存在".to_owned());
  }
  let parent_id = id(command, "parentId")?;
  let title = string(command, "title")?.to_owned();
  let desired_side = side(document, &parent_id, command.get("side"))?;
  let length = array(&topic(document, &parent_id)?["children"])?.len();
  let index = index(command, length)?;
  array_mut(&mut topic_mut(document, &parent_id)?["children"])?.insert(index, json!(new_id));
  topic_mut(document, &parent_id)?["collapsed"] = json!(false);
  object_mut(&mut document["topics"])?.insert(
    new_id.clone(),
    json!({
      "id": new_id, "title": title, "children": [], "collapsed": false, "side": desired_side
    }),
  );
  Ok(())
}

fn insert_parent(document: &mut Value, command: &Value) -> Result<(), String> {
  let topic_id = id(command, "topicId")?;
  if document["floatingIds"]
    .as_array()
    .is_some_and(|ids| ids.contains(&json!(topic_id)))
  {
    return Err("游离主题不支持此结构操作".to_owned());
  }
  let parent_id = parent_id(document, &topic_id)?;
  let new_id = id(command, "id")?;
  let title = string(command, "title")?;
  if document["topics"].get(&new_id).is_some() {
    return Err("主题 ID 已存在".to_owned());
  }
  let topic_side = topic(document, &topic_id)?["side"].clone();
  let children = array_mut(&mut topic_mut(document, &parent_id)?["children"])?;
  let slot = children
    .iter()
    .position(|child| child == &topic_id)
    .ok_or("父主题缺少子主题")?;
  children[slot] = json!(new_id);
  topic_mut(document, &parent_id)?["collapsed"] = json!(false);
  object_mut(&mut document["topics"])?.insert(
    new_id.clone(),
    json!({
      "id": new_id, "title": title, "children": [topic_id], "collapsed": false, "side": topic_side
    }),
  );
  Ok(())
}

fn remove_only(document: &mut Value, topic_id: &str) -> Result<(), String> {
  if document["floatingIds"]
    .as_array()
    .is_some_and(|ids| ids.contains(&json!(topic_id)))
  {
    return Err("游离主题不支持此结构操作".to_owned());
  }
  let parent = parent_id(document, topic_id)?;
  let children = ids(&topic(document, topic_id)?["children"])?;
  let slot = array(&topic(document, &parent)?["children"])?
    .iter()
    .position(|child| child == topic_id)
    .ok_or("父主题缺少子主题")?;
  if !children.is_empty() {
    let move_command = json!({"type":"moveTopics", "parentId":parent, "index":slot});
    move_topics(document, &children, &move_command)?;
  }
  delete(document, &[topic_id.to_owned()])
}

pub(super) fn normalized(document: &Value, selected: &[String]) -> Result<Vec<String>, String> {
  for id in selected {
    topic(document, id)?;
  }
  let set: HashSet<_> = selected.iter().cloned().collect();
  let mut roots = Vec::new();
  let mut pending = vec![string(document, "rootId")?.to_owned()];
  while let Some(id) = pending.pop() {
    if set.contains(&id) {
      roots.push(id);
      continue;
    }
    let mut children = ids(&topic(document, &id)?["children"])?;
    children.reverse();
    pending.extend(children);
  }
  Ok(roots)
}

fn delete(document: &mut Value, selected: &[String]) -> Result<(), String> {
  let roots = normalized(document, selected)?;
  if roots.is_empty() {
    return Ok(());
  }
  if roots.iter().any(|id| document["rootId"] == *id) {
    return Err("不能删除中心主题".to_owned());
  }
  let mut removed = HashSet::new();
  for root in &roots {
    removed.extend(subtree(document, root)?);
  }
  references::prune_topics(document, &removed)
}

pub(super) fn move_topics(
  document: &mut Value,
  selected: &[String],
  command: &Value,
) -> Result<(), String> {
  let roots = normalized(document, selected)?;
  let destination = id(command, "parentId")?;
  topic(document, &destination)?;
  if roots.is_empty() {
    return Ok(());
  }
  if roots.iter().any(|id| document["rootId"] == *id) {
    return Err("不能移动中心主题".to_owned());
  }
  for root in &roots {
    if subtree(document, root)?.contains(&destination) {
      return Err("不能将主题移动到自身或后代中".to_owned());
    }
  }
  let old = document.clone();
  for entry in object_mut(&mut document["topics"])?.values_mut() {
    let children = array_mut(&mut entry["children"])?;
    children.retain(|child| !roots.iter().any(|id| child == id));
  }
  let length = array(&topic(document, &destination)?["children"])?.len();
  let index = index(command, length)?;
  let mut children = ids(&topic(document, &destination)?["children"])?;
  children.splice(index..index, roots.iter().cloned());
  topic_mut(document, &destination)?["children"] = json!(children);
  topic_mut(document, &destination)?["collapsed"] = json!(false);
  for root in &roots {
    let requested = command.get("side").or_else(|| {
      if old["rootId"] == destination {
        old["topics"][root].get("side")
      } else {
        None
      }
    });
    let branch_side = side(&old, &destination, requested)?;
    for id in subtree(&old, root)? {
      topic_mut(document, &id)?["side"] = json!(branch_side);
    }
  }
  references::clear_floating(document, &roots)?;
  Ok(())
}
