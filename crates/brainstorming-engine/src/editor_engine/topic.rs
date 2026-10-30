use super::{extensions, helpers::*, references, topic_content, topic_structural};
use icu_segmenter::WordSegmenter;
use regex::RegexBuilder;
use serde_json::{Value, json};

pub(super) fn apply(document: &mut Value, command: &Value) -> Result<(), String> {
  let mut pending = vec![(command.clone(), 0usize)];
  let mut count = 0usize;
  while let Some((command, depth)) = pending.pop() {
    count += 1;
    if count > 10_000 || depth > 32 {
      return Err("批量命令超过数量或嵌套限制".to_owned());
    }
    if command["type"] == "batch" {
      let children = array(field(&command, "commands")?)?;
      if count + children.len() + pending.len() > 10_000 {
        return Err("批量命令超过数量限制".to_owned());
      }
      pending.extend(
        children
          .iter()
          .rev()
          .cloned()
          .map(|child| (child, depth + 1)),
      );
    } else {
      apply_one(document, &command)?;
    }
  }
  references::sanitize_summaries(document)?;
  Ok(())
}

fn apply_one(document: &mut Value, command: &Value) -> Result<(), String> {
  let kind = string(command, "type")?;
  if topic_structural::apply(document, command)? {
    return Ok(());
  }
  if topic_content::apply(document, command)? {
    return Ok(());
  }
  if extensions::apply(document, command)? {
    return Ok(());
  }
  match kind {
    "renameTopic" => {
      let topic_id = id(command, "topicId")?;
      let title = string(command, "title")?.to_owned();
      let root = document["rootId"] == topic_id;
      let topic = topic_mut(document, &topic_id)?;
      if topic["title"] == title {
        return Ok(());
      }
      topic["title"] = Value::String(title.clone());
      clear_rich_title(topic)?;
      if root {
        document["title"] = Value::String(title);
      }
    }
    "toggleCollapse" => {
      let topic_id = id(command, "topicId")?;
      let topic = topic_mut(document, &topic_id)?;
      topic["collapsed"] = Value::Bool(!topic["collapsed"].as_bool().ok_or("折叠状态无效")?);
    }
    "setSide" => {
      let topic_id = id(command, "topicId")?;
      let parent = parent_id(document, &topic_id)?;
      if document["rootId"] != parent {
        return Err("请对一级分支修改方向".to_owned());
      }
      let desired = string(command, "side")?;
      if !matches!(desired, "left" | "right") {
        return Err("主题方向无效".to_owned());
      }
      let descendants = subtree(document, &topic_id)?;
      for id in descendants {
        topic_mut(document, &id)?["side"] = Value::String(desired.to_owned());
      }
    }
    "setTopicStyle" => {
      let topic_id = id(command, "topicId")?;
      let style = field(command, "style")?.clone();
      let source = object(&style)?;
      let mut normalized = serde_json::Map::new();
      for key in [
        "offsetX",
        "offsetY",
        "spatialDepth",
        "fill",
        "color",
        "fontSize",
        "width",
        "scale",
        "bold",
        "italic",
        "shape",
        "lineStyle",
        "lineWidth",
      ] {
        if let Some(value) = source.get(key) {
          normalized.insert(key.to_owned(), value.clone());
        }
      }
      topic_mut(document, &topic_id)?["style"] = Value::Object(normalized);
    }
    "replaceTopicText" => replace_text(document, command)?,
    _ => return Err(format!("不支持的主题命令 {kind}")),
  }
  Ok(())
}

fn replace_text(document: &mut Value, command: &Value) -> Result<(), String> {
  let topic_id = id(command, "topicId")?;
  let query = string(command, "query")?;
  let replacement = string(command, "replacement")?;
  if query.is_empty() {
    return Err("查找内容不能为空".to_owned());
  }
  let field = command.get("field").and_then(Value::as_str);
  if field.is_some_and(|field| !matches!(field, "title" | "notes")) {
    return Err("查找字段无效".to_owned());
  }
  let expression = RegexBuilder::new(&regex::escape(query))
    .case_insensitive(command["matchCase"] != true)
    .build()
    .map_err(|error| error.to_string())?;
  let title = string(topic(document, &topic_id)?, "title")?.to_owned();
  let updated_title = if field == Some("notes") {
    title.clone()
  } else {
    replace_matches(
      &title,
      &expression,
      replacement,
      command["wholeWord"] == true,
    )
  };
  let old_notes = topic(document, &topic_id)?["notes"]
    .as_str()
    .map(str::to_owned);
  let updated_notes = if (field == Some("notes")
    || (field.is_none() && command["includeNotes"] == true))
    && old_notes.is_some()
  {
    old_notes.as_deref().map(|notes| {
      replace_matches(
        notes,
        &expression,
        replacement,
        command["wholeWord"] == true,
      )
    })
  } else {
    old_notes.clone()
  };
  if updated_title == title && updated_notes == old_notes {
    return Ok(());
  }
  if updated_title != title {
    topic_mut(document, &topic_id)?["title"] = json!(updated_title);
    clear_rich_title(topic_mut(document, &topic_id)?)?;
  }
  if updated_notes != old_notes {
    topic_mut(document, &topic_id)?["notes"] = json!(updated_notes);
  }
  if document["rootId"] == topic_id {
    document["title"] = json!(updated_title);
  }
  Ok(())
}

fn replace_matches(
  text: &str,
  expression: &regex::Regex,
  replacement: &str,
  whole_word: bool,
) -> String {
  let boundaries: std::collections::HashSet<usize> = if whole_word {
    WordSegmenter::new_auto(Default::default())
      .segment_str(text)
      .collect()
  } else {
    std::collections::HashSet::new()
  };
  let mut result = String::new();
  let mut cursor = 0;
  for found in expression.find_iter(text) {
    if whole_word && (!boundaries.contains(&found.start()) || !boundaries.contains(&found.end())) {
      continue;
    }
    result.push_str(&text[cursor..found.start()]);
    result.push_str(replacement);
    cursor = found.end();
  }
  result.push_str(&text[cursor..]);
  result
}

fn clear_rich_title(topic: &mut Value) -> Result<(), String> {
  if let Some(metadata) = topic.get_mut("metadata").and_then(Value::as_object_mut) {
    metadata.remove("richTitle");
    if metadata.is_empty() {
      object_mut(topic)?.remove("metadata");
    }
  }
  Ok(())
}
