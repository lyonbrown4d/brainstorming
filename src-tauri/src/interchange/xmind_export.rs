use super::{archive, xmind_assets::safe_name};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};

pub fn encode(workbook: &Value) -> Result<Vec<u8>, String> {
  let mut entries = Vec::new();
  let mut manifest = Map::new();
  let mut sheets = Vec::new();
  let mut resource_bytes = 0usize;
  for (index, sheet) in workbook["sheets"]
    .as_array()
    .ok_or("XMind 画布无效")?
    .iter()
    .enumerate()
  {
    let document = &sheet["document"];
    let topics = document["topics"].as_object().ok_or("XMind 主题无效")?;
    let assets = document.get("assets").and_then(Value::as_object);
    let mut referenced = Vec::new();
    let mut seen = HashSet::new();
    for topic in topics.values() {
      if let Some(id) = topic["image"]["assetId"].as_str() {
        push_ref(id, &mut referenced, &mut seen);
      }
      for id in topic["attachments"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
      {
        push_ref(id, &mut referenced, &mut seen);
      }
      if let Some(id) = topic["metadata"]["audioAssetId"].as_str() {
        push_ref(id, &mut referenced, &mut seen);
      }
    }
    let mut paths = HashMap::new();
    for id in referenced {
      let asset = assets
        .and_then(|assets| assets.get(&id))
        .ok_or("XMind 导出缺少资源")?;
      let encoded = asset["data"]
        .as_str()
        .ok_or("XMind 导出资源尚未加载，请先读取存储资源")?;
      let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "XMind 导出资源编码无效")?;
      if bytes.len() > 8 * 1024 * 1024 {
        return Err("XMind 导出资源超过 8 MiB 限制".into());
      }
      resource_bytes += bytes.len();
      if resource_bytes > 24 * 1024 * 1024 {
        return Err("XMind 导出资源总量超过 24 MiB 限制".into());
      }
      let name =
        safe_name(asset["name"].as_str().ok_or("XMind 资源名称无效")?).replace(['%', '#'], "_");
      let path = format!("resources/{index}-{}-{name}", paths.len());
      manifest.insert(path.clone(), json!({}));
      paths.insert(id, path.clone());
      entries.push((path, bytes));
    }
    let root = document["rootId"].as_str().ok_or("XMind 中心主题无效")?;
    let root_topic = topic(root, document, &paths, true)?;
    let mut extension = Map::new();
    for key in [
      "settings",
      "relations",
      "groups",
      "callouts",
      "floatingIds",
      "floatingPositions",
      "presentation",
      "drawings",
    ] {
      if let Some(value) = document.get(key) {
        extension.insert(key.into(), value.clone());
      }
    }
    extension.insert(
      "workbook".into(),
      json!({"id":workbook["id"],"title":workbook["title"]}),
    );
    sheets.push(
      json!({"id":sheet["id"],"class":"sheet","title":sheet["name"],"rootTopic":root_topic,
      "extensions":[{"provider":"org.brainstorming.interchange","content":extension}]}),
    );
  }
  entries.push(("content.json".into(), json_bytes(&sheets)?));
  entries.push((
    "metadata.json".into(),
    json_bytes(
      &json!({"creator":{"name":"Brainstorming","version":"0.1.0"},
    "activeSheetId":workbook["sheets"][0]["id"]}),
    )?,
  ));
  manifest.insert("content.json".into(), json!({}));
  manifest.insert("metadata.json".into(), json!({}));
  entries.push((
    "manifest.json".into(),
    json_bytes(&json!({"file-entries":manifest}))?,
  ));
  archive::write(&entries)
}

fn push_ref(id: &str, result: &mut Vec<String>, seen: &mut HashSet<String>) {
  if seen.insert(id.into()) {
    result.push(id.into());
  }
}
fn json_bytes(value: &impl serde::Serialize) -> Result<Vec<u8>, String> {
  let bytes = serde_json::to_vec(value).map_err(|_| "XMind JSON 编码失败")?;
  if bytes.len() > 10 * 1024 * 1024 {
    return Err("XMind JSON 条目超过 10 MiB 限制".into());
  }
  Ok(bytes)
}

fn topic(
  id: &str,
  document: &Value,
  paths: &HashMap<String, String>,
  root: bool,
) -> Result<Value, String> {
  let topic = document["topics"].get(id).ok_or("XMind 导出缺少主题")?;
  let mut children = Vec::new();
  for child in topic["children"].as_array().ok_or("XMind 导出子主题无效")? {
    children.push(self::topic(
      child.as_str().ok_or("XMind 导出子主题无效")?,
      document,
      paths,
      false,
    )?);
  }
  let structure = topic["structure"].as_str().or_else(|| {
    if root {
      document["settings"]["layout"].as_str()
    } else {
      None
    }
  });
  let mut result = json!({"id":id,"class":"topic","title":topic["title"],
    "branch":if topic["collapsed"] == true { "folded" } else { "expanded" },
    "children":{"attached":children}});
  if let Some(structure) = structure {
    result["structureClass"] = json!(export_structure(structure));
  }
  if let Some(style) = topic.get("style") {
    result["style"] = json!({"id":format!("style-{id}"),"properties":style_properties(style)});
  }
  if let Some(notes) = topic["notes"].as_str().filter(|value| !value.is_empty()) {
    result["notes"] = json!({"plain":{"content":notes}});
  }
  if let Some(image) = topic.get("image") {
    let id = image["assetId"].as_str().ok_or("XMind 图片资源标识无效")?;
    let path = paths.get(id).ok_or("XMind 导出缺少图片资源")?;
    result["image"] =
      json!({"src":format!("xap:{path}"),"width":image["width"],"height":image["height"]});
  }
  let attachments = topic["attachments"]
    .as_array()
    .map(Vec::as_slice)
    .unwrap_or(&[]);
  if let Some(first) = attachments.first() {
    let id = first.as_str().ok_or("XMind 附件资源标识无效")?;
    result["href"] = json!(format!(
      "xap:{}",
      paths.get(id).ok_or("XMind 导出缺少附件资源")?
    ));
  } else if topic["metadata"]["link"]["kind"] == "url" {
    result["href"] = topic["metadata"]["link"]["url"].clone();
  }
  if let Some(labels) = topic["metadata"].get("labels") {
    result["labels"] = labels.clone();
  }
  if let Some(priority) = topic["metadata"]["task"]["priority"]
    .as_u64()
    .filter(|value| (1..=9).contains(value))
  {
    result["markers"] = json!([{"markerId":format!("priority-{priority}")}]);
  }
  let mut extension = Map::new();
  extension.insert("side".into(), topic["side"].clone());
  for key in ["metadata", "structure", "style"] {
    if let Some(value) = topic.get(key) {
      extension.insert(key.into(), value.clone());
    }
  }
  if let Some(image) = topic.get("image") {
    let id = image["assetId"].as_str().ok_or("XMind 图片资源标识无效")?;
    let asset = &document["assets"][id];
    extension.insert("image".into(),json!({"src":format!("xap:{}",paths.get(id).ok_or("XMind 导出缺少图片资源")?),
      "width":image["width"],"height":image["height"],"name":asset["name"],"mimeType":asset["mimeType"]}));
  }
  if let Some(id) = topic["metadata"]["audioAssetId"].as_str() {
    let asset = &document["assets"][id];
    extension.insert(
      "audio".into(),
      json!({"src":format!("xap:{}",paths.get(id).ok_or("XMind 导出缺少音频资源")?),
      "name":asset["name"],"mimeType":asset["mimeType"]}),
    );
  }
  let mut portable = Vec::new();
  for id in attachments {
    let id = id.as_str().ok_or("XMind 附件资源标识无效")?;
    let asset = &document["assets"][id];
    portable.push(
      json!({"src":format!("xap:{}", paths.get(id).ok_or("XMind 导出缺少附件资源")?),
      "name":asset["name"],"mimeType":asset["mimeType"]}),
    );
  }
  extension.insert("attachments".into(), json!(portable));
  result["extensions"] = json!([{"provider":"org.brainstorming.interchange","content":extension}]);
  Ok(result)
}

fn style_properties(style: &Value) -> Value {
  let mut properties = Map::new();
  if let Some(fill) = style.get("fill") {
    properties.insert("svg:fill".into(), fill.clone());
  }
  if let Some(color) = style.get("color") {
    properties.insert("fo:color".into(), color.clone());
  }
  if let Some(size) = style["fontSize"].as_f64() {
    properties.insert("fo:font-size".into(), json!(format!("{size}pt")));
  }
  if let Some(bold) = style["bold"].as_bool() {
    properties.insert(
      "fo:font-weight".into(),
      json!(if bold { "bold" } else { "normal" }),
    );
  }
  if let Some(italic) = style["italic"].as_bool() {
    properties.insert(
      "fo:font-style".into(),
      json!(if italic { "italic" } else { "normal" }),
    );
  }
  if let Some(shape) = style["shape"].as_str() {
    let xmind = match shape {
      "rectangle" | "flag" | "bookmark" | "sticky" => "rect",
      "ellipse" | "circle" => "ellipse",
      "text" => "noShape",
      "diamond" => "diamond",
      "hexagon" | "tag" => "hexagon",
      "cloud" => "cloud",
      "speech" => "callout",
      _ => "roundedRect",
    };
    properties.insert(
      "shape-class".into(),
      json!(format!("org.xmind.topicShape.{xmind}")),
    );
  }
  Value::Object(properties)
}
fn export_structure(kind: &str) -> &'static str {
  match kind {
    "map" => "org.xmind.ui.map.unbalanced",
    "logic-left" | "brace-left" => "org.xmind.ui.logic.left",
    "org-down" | "tree-down" | "tree-table-down" => "org.xmind.ui.org-chart.down",
    "org-up" | "tree-up" => "org.xmind.ui.org-chart.up",
    "timeline" => "org.xmind.ui.timeline.horizontal",
    "timeline-vertical" => "org.xmind.ui.timeline.vertical",
    "fishbone" => "org.xmind.ui.fishbone.leftHeaded",
    _ => "org.xmind.ui.logic.right",
  }
}
