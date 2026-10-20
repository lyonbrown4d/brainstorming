use super::helpers::*;
use serde_json::{Value, json};
use unicode_segmentation::UnicodeSegmentation;

pub(super) fn apply(workbook: &mut Value, command: &Value) -> Result<(), String> {
  let kind = string(command, "type")?;
  let before = workbook.clone();
  if kind == "addSheet" {
    let sheet = field(command, "sheet")?.clone();
    let id = id(&sheet, "id")?;
    if workbook["sheets"]
      .as_array()
      .is_some_and(|sheets| sheets.iter().any(|sheet| sheet["id"] == id))
    {
      return Err("画布 ID 已存在".to_owned());
    }
    let sheets = array_mut(&mut workbook["sheets"])?;
    let index = index(command, sheets.len())?;
    sheets.insert(index, sheet);
    return Ok(());
  }
  let sheet_id = id(command, "sheetId")?;
  let sheets = array_mut(&mut workbook["sheets"])?;
  let source = sheets
    .iter()
    .position(|sheet| sheet["id"] == sheet_id)
    .ok_or("画布不存在")?;
  match kind {
    "renameSheet" => {
      let name = string(command, "name")?;
      if name.trim().is_empty() {
        return Err("画布名称不能为空".to_owned());
      }
      sheets[source]["name"] = json!(name);
    }
    "duplicateSheet" => {
      let new_id = id(command, "id")?;
      if sheets.iter().any(|sheet| sheet["id"] == new_id) {
        return Err("画布 ID 已存在".to_owned());
      }
      let mut copy = sheets[source].clone();
      copy["id"] = json!(new_id);
      copy["document"]["id"] = json!(new_id);
      let name = string(&copy, "name")?;
      let shortened: String = name.graphemes(true).take(77).collect();
      copy["name"] = json!(format!("{shortened} 副本"));
      if let Some(topics) = copy["document"]["topics"].as_object_mut() {
        for topic in topics.values_mut() {
          if let Some(link) = topic
            .get_mut("metadata")
            .and_then(|metadata| metadata.get_mut("link"))
            && link["kind"] == "topic"
            && link["sheetId"] == sheet_id
          {
            link["sheetId"] = json!(new_id);
          }
        }
      }
      sheets.insert(source + 1, copy);
    }
    "deleteSheet" => {
      if sheets.len() == 1 {
        return Err("不能删除最后一个画布".to_owned());
      }
      sheets.remove(source);
    }
    "moveSheet" => {
      let index = index(command, sheets.len() - 1)?;
      let sheet = sheets.remove(source);
      sheets.insert(index, sheet);
    }
    "updateSheet" => {
      sheets[source]["document"] = field(command, "document")?.clone();
    }
    _ => return Err(format!("不支持的画布命令 {kind}")),
  }
  cleanup_links(&before, workbook);
  Ok(())
}

pub(super) fn cleanup_links(before: &Value, after: &mut Value) {
  let Some(old_sheets) = before["sheets"].as_array() else {
    return;
  };
  let Some(new_sheets) = after["sheets"].as_array() else {
    return;
  };
  let mut removed = std::collections::HashMap::<String, std::collections::HashSet<String>>::new();
  for old in old_sheets {
    let Some(sheet_id) = old["id"].as_str() else {
      continue;
    };
    let next = new_sheets.iter().find(|sheet| sheet["id"] == sheet_id);
    let old_ids = old["document"]["topics"]
      .as_object()
      .map(|topics| topics.keys());
    let Some(old_ids) = old_ids else {
      continue;
    };
    let deleted = old_ids
      .filter(|id| {
        next
          .and_then(|sheet| sheet["document"]["topics"].get(*id))
          .is_none()
      })
      .cloned()
      .collect();
    removed.insert(sheet_id.to_owned(), deleted);
  }
  let Some(sheets) = after["sheets"].as_array_mut() else {
    return;
  };
  for sheet in sheets {
    let Some(topics) = sheet["document"]["topics"].as_object_mut() else {
      continue;
    };
    for topic in topics.values_mut() {
      let link = &topic["metadata"]["link"];
      let target_sheet = link["sheetId"].as_str();
      let target_topic = link["topicId"].as_str();
      if link["kind"] == "topic"
        && target_sheet
          .zip(target_topic)
          .is_some_and(|(sheet, topic)| removed.get(sheet).is_some_and(|ids| ids.contains(topic)))
        && let Some(metadata) = topic.get_mut("metadata").and_then(Value::as_object_mut)
      {
        metadata.remove("link");
      }
    }
  }
}
