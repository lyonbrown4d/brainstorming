use super::outline::{Sheet, Topic};
use serde_json::{Map, Value, json};
use uuid::Uuid;

pub(super) fn workbook(sheets: Vec<Sheet>) -> Result<Value, String> {
  if sheets.is_empty() || sheets.len() > 128 {
    return Err("大纲画布数须为 1 至 128".into());
  }
  let title = sheets[0].name.clone();
  let mut count = 0;
  let sheets = sheets
    .into_iter()
    .map(|sheet| {
      let id = Uuid::new_v4().to_string();
      let mut topics = Map::new();
      let root_id = add_topic(&sheet.root, 1, &mut count, &mut topics)?;
      let name: String = sheet.name.chars().take(80).collect();
      let name = if name.trim().is_empty() {
        "导入大纲".into()
      } else {
        name
      };
      Ok(
        json!({"id": id, "name": name, "document": {"format":"brainstorming", "version":1,
      "id":id, "title":sheet.root.title, "rootId":root_id, "topics":topics}}),
      )
    })
    .collect::<Result<Vec<Value>, String>>()?;
  Ok(
    json!({"format":"brainstorming", "version":2, "id":Uuid::new_v4().to_string(), "title":title, "sheets":sheets}),
  )
}
fn add_topic(
  topic: &Topic,
  depth: usize,
  count: &mut usize,
  topics: &mut Map<String, Value>,
) -> Result<String, String> {
  *count += 1;
  if depth > 128 || *count > 20_000 {
    return Err("大纲超过 128 层或 20000 个主题".into());
  }
  let id = Uuid::new_v4().to_string();
  let children = topic
    .children
    .iter()
    .map(|child| add_topic(child, depth + 1, count, topics))
    .collect::<Result<Vec<_>, _>>()?;
  let mut value =
    json!({"id":id, "title":topic.title, "children":children, "collapsed":false, "side":"right"});
  if let Some(notes) = &topic.notes {
    value["notes"] = json!(notes);
  }
  topics.insert(id.clone(), value);
  Ok(id)
}
