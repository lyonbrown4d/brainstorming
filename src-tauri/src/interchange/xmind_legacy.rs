use super::xmind_xml::{self, Node};
use serde_json::{Map, Value, json};
use std::collections::HashMap;

pub fn parse(content: &[u8], styles: Option<&[u8]>) -> Result<Vec<Value>, String> {
  let root = xmind_xml::parse(content, "XMind content.xml")?;
  if root.name != "xmap-content" {
    return Err("XMind content.xml 缺少 xmap-content".into());
  }
  let styles = styles.map(styles_map).transpose()?.unwrap_or_default();
  let sheets: Vec<_> = root.children("sheet").collect();
  if sheets.is_empty() || sheets.len() > 128 {
    return Err("XMind 画布数须为 1 至 128".into());
  }
  sheets.into_iter().map(|sheet| {
    let topic = sheet.children("topic").collect::<Vec<_>>();
    if topic.len() != 1 { return Err("XMind XML 画布必须有一个中心主题".into()) }
    Ok(json!({"id":sheet.attrs.get("id"), "title":sheet.child("title").map(Node::text_content).unwrap_or_default(),
      "rootTopic": convert_topic(topic[0], &styles, 0)?}))
  }).collect()
}

fn styles_map(bytes: &[u8]) -> Result<HashMap<String, Value>, String> {
  let root = xmind_xml::parse(bytes, "XMind styles.xml")?;
  if root.name != "xmap-styles" {
    return Err("XMind styles.xml 缺少 xmap-styles".into());
  }
  let mut result = HashMap::new();
  for container in root
    .children
    .iter()
    .filter(|node| ["styles", "automatic-styles"].contains(&node.name.as_str()))
  {
    for style in container.children("style") {
      if let Some(id) = style.attrs.get("id") {
        let properties = style
          .child("topic-properties")
          .map(|node| serde_json::to_value(&node.attrs).unwrap_or_default())
          .unwrap_or_else(|| json!({}));
        result.insert(id.clone(), json!({"properties":properties}));
      }
    }
  }
  Ok(result)
}

fn convert_topic(
  node: &Node,
  styles: &HashMap<String, Value>,
  depth: usize,
) -> Result<Value, String> {
  if depth >= 128 {
    return Err("XMind XML 主题层级超出限制".into());
  }
  let mut children = Map::new();
  if let Some(container) = node.child("children") {
    for group in container.children("topics") {
      let kind = group
        .attrs
        .get("type")
        .map(String::as_str)
        .unwrap_or("attached");
      let converted = group
        .children("topic")
        .map(|child| convert_topic(child, styles, depth + 1))
        .collect::<Result<Vec<_>, _>>()?;
      children
        .entry(kind)
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or("XMind 子主题无效")?
        .extend(converted);
    }
  }
  let mut result = json!({
    "id":node.attrs.get("id"), "title":node.child("title").map(Node::text_content).unwrap_or_default(),
    "children":children,
  });
  for (source, target) in [
    ("branch", "branch"),
    ("href", "href"),
    ("structure-class", "structureClass"),
  ] {
    if let Some(value) = node.attrs.get(source) {
      result[target] = json!(value);
    }
  }
  if let Some(style_id) = node.attrs.get("style-id")
    && let Some(style) = styles.get(style_id)
  {
    result["style"] = style.clone();
  }
  if let Some(notes) = node.child("notes")
    && let Some(plain) = notes.child("plain")
  {
    result["notes"] = json!({"plain":{"content":plain.text_content()}});
  }
  if let Some(image) = node.child("img") {
    result["image"] = json!({"src":image.attrs.get("href")});
  }
  if let Some(markers) = node.child("marker-refs") {
    result["markers"] = json!(
      markers
        .children("marker-ref")
        .map(|marker| json!({"markerId":marker.attrs.get("marker-id")}))
        .collect::<Vec<_>>()
    );
  }
  Ok(result)
}
