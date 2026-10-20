use super::{Imported, archive, xmind_assets::Assets, xmind_legacy};
use serde_json::{Map, Value, json};
use std::collections::HashSet;

pub struct Warnings(Vec<(String, usize)>);
impl Warnings {
  pub fn new() -> Self {
    Self(Vec::new())
  }
  pub fn add(&mut self, message: &str, count: usize) {
    if count == 0 {
      return;
    }
    if let Some((_, existing)) = self.0.iter_mut().find(|(text, _)| text == message) {
      *existing += count;
    } else {
      self.0.push((message.into(), count));
    }
  }
  pub fn omitted(&mut self, source: &Map<String, Value>, supported: &[&str]) {
    for (key, value) in source {
      if supported.contains(&key.as_str()) || value.is_null() {
        continue;
      }
      let feature = match key.as_str() {
        "theme" => "主题配色",
        "relationships" => "关联线",
        "summaries" => "概要范围",
        "boundaries" => "外框",
        "position" => "自由位置",
        "numbering" => "编号",
        "width" => "固定宽度",
        "legend" => "图例",
        _ => "扩展属性",
      };
      let count = value.as_array().map(Vec::len).unwrap_or(1);
      self.add(&format!("未导入 XMind {feature}"), count);
    }
  }
  pub fn finish(self) -> Vec<String> {
    self
      .0
      .into_iter()
      .map(|(message, count)| format!("{message}（{count} 项）"))
      .collect()
  }
}

pub struct Ids {
  prefix: String,
  used: HashSet<String>,
  reserved: HashSet<String>,
  sequence: usize,
}
impl Ids {
  pub fn new(prefix: String, reserved: HashSet<String>) -> Self {
    Self {
      prefix,
      used: HashSet::new(),
      reserved,
      sequence: 0,
    }
  }
  pub fn allocate(&mut self, candidate: &Value, warnings: &mut Warnings) -> String {
    let id = candidate.as_str().unwrap_or("");
    if !id.trim().is_empty()
      && !["__proto__", "constructor", "prototype"].contains(&id)
      && !self.used.contains(id)
    {
      self.used.insert(id.into());
      return id.into();
    }
    loop {
      self.sequence += 1;
      let id = format!("{}-{}", self.prefix, self.sequence);
      if !self.used.contains(&id) && !self.reserved.contains(&id) {
        self.used.insert(id.clone());
        warnings.add("缺失、重复或保留的 ID 已重新生成", 1);
        return id;
      }
    }
  }
}

pub fn decode(bytes: &[u8]) -> Result<Imported, String> {
  let entries = archive::read(bytes)?;
  let sources: Vec<Value> = if let Some(content) = entries.get("content.json") {
    serde_json::from_slice::<Value>(content)
      .map_err(|_| "XMind content.json 不是有效的 UTF-8 JSON")?
      .as_array()
      .ok_or("XMind 画布必须是列表")?
      .clone()
  } else {
    let content = entries
      .get("content.xml")
      .ok_or("XMind 文件缺少 content.json 或 content.xml")?;
    xmind_legacy::parse(content, entries.get("styles.xml").map(Vec::as_slice))?
  };
  if sources.is_empty() || sources.len() > 128 {
    return Err("XMind 画布数须为 1 至 128".into());
  }
  let mut warnings = Warnings::new();
  let reserved = sources
    .iter()
    .filter_map(|source| source["id"].as_str().map(str::to_string))
    .collect();
  let mut sheet_ids = Ids::new("xmind-sheet".into(), reserved);
  let mut used = HashSet::new();
  let mut budget = 0usize;
  let mut total_topics = 0usize;
  let mut identity: Option<(String, String)> = None;
  let mut sheets = Vec::new();
  for (index, source) in sources.iter().enumerate() {
    let source = source.as_object().ok_or("XMind 画布格式无效")?;
    warnings.omitted(source, &["id", "title", "rootTopic", "extensions", "class"]);
    let raw_name = source
      .get("title")
      .map(|value| value.as_str().ok_or("XMind 画布标题必须是文本"))
      .transpose()?
      .map(str::to_string)
      .unwrap_or_else(|| format!("画布 {}", index + 1));
    let name: String = raw_name.chars().take(80).collect();
    let name = if name.trim().is_empty() {
      format!("画布 {}", index + 1)
    } else {
      name
    };
    if name != raw_name {
      warnings.add("画布名称已调整为 Brainstorming 支持的长度或默认名称", 1);
    }
    let extension = own_extension(source, &mut warnings)?;
    if let Some(workbook) = extension.as_ref().and_then(|value| value.get("workbook")) {
      let id = workbook["id"]
        .as_str()
        .ok_or("XMind Brainstorming 工作簿信息无效")?;
      let title = workbook["title"]
        .as_str()
        .ok_or("XMind Brainstorming 工作簿信息无效")?;
      if identity
        .as_ref()
        .is_some_and(|old| old.0 != id || old.1 != title)
      {
        return Err("XMind Brainstorming 工作簿信息不一致".into());
      }
      identity = Some((id.into(), title.into()));
    }
    let id = sheet_ids.allocate(source.get("id").unwrap_or(&Value::Null), &mut warnings);
    let root = source.get("rootTopic").ok_or("XMind 缺少中心主题")?;
    let root = root.as_object().ok_or("XMind 中心主题格式无效")?;
    let reserved = topic_ids(root)?;
    let mut ids = Ids::new(format!("xmind-topic-{}", index + 1), reserved);
    let mut topics = Map::new();
    let mut assets = Assets::new(&entries, &mut used, &mut budget);
    let layout = super::xmind_import_fields::structure(root.get("structureClass"), &mut warnings);
    let root_id = super::xmind_import_topic::topic(
      root,
      &mut topics,
      &mut ids,
      &mut assets,
      &mut warnings,
      &mut total_topics,
      0,
      "right",
    )?;
    let mut document = json!({"format":"brainstorming", "version":1,"id":id,
      "title":topics[&root_id]["title"],"rootId":root_id,"topics":topics});
    if !assets.values.is_empty() {
      document["assets"] = Value::Object(assets.values);
    }
    if let Some(extension) = &extension {
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
        if let Some(value) = extension.get(key) {
          document[key] = value.clone();
        }
      }
    } else if let Some(layout) = layout {
      document["settings"] = json!({"layout":layout});
    }
    sheets.push(json!({"id":id,"name":name,"document":document}));
  }
  for path in entries.keys() {
    if (path.starts_with("resources/") || path.starts_with("attachments/"))
      && !path.ends_with('/')
      && !used.contains(path)
    {
      warnings.add("未导入 XMind 未引用或不支持的内嵌资源", 1);
    }
  }
  let (id, title) = identity.unwrap_or_else(|| {
    (
      "xmind-import".into(),
      sheets[0]["name"].as_str().unwrap_or("XMind").into(),
    )
  });
  Ok(Imported {
    workbook: json!({"format":"brainstorming","version":2,"id":id,"title":title,"sheets":sheets}),
    warnings: warnings.finish(),
  })
}

pub fn own_extension(
  source: &Map<String, Value>,
  warnings: &mut Warnings,
) -> Result<Option<Map<String, Value>>, String> {
  let Some(value) = source.get("extensions") else {
    return Ok(None);
  };
  let entries = value.as_array().ok_or("XMind extensions 必须是列表")?;
  if entries.len() > 64 {
    return Err("XMind 扩展数量超过限制".into());
  }
  let mut result = None;
  for entry in entries {
    let entry = entry.as_object().ok_or("XMind extension 格式无效")?;
    if entry.get("provider").and_then(Value::as_str) == Some("org.brainstorming.interchange") {
      if result.is_some() {
        return Err("XMind Brainstorming 扩展重复".into());
      }
      result = Some(
        entry
          .get("content")
          .and_then(Value::as_object)
          .ok_or("XMind Brainstorming 扩展内容无效")?
          .clone(),
      );
    } else {
      warnings.add("未导入 XMind 第三方扩展内容", 1);
    }
  }
  Ok(result)
}

fn topic_ids(root: &Map<String, Value>) -> Result<HashSet<String>, String> {
  let mut reserved = HashSet::new();
  let mut pending = vec![(root, 0usize)];
  let mut count = 0;
  while let Some((topic, depth)) = pending.pop() {
    count += 1;
    if depth >= 128 || count > 20_000 {
      return Err("XMind 主题数量超过 20000 或层级超过 128".into());
    }
    if let Some(id) = topic.get("id").and_then(Value::as_str) {
      reserved.insert(id.into());
    }
    if let Some(groups) = topic.get("children") {
      let groups = groups.as_object().ok_or("XMind children 格式无效")?;
      for entries in groups.values() {
        for child in entries.as_array().ok_or("XMind 子主题必须是列表")? {
          pending.push((child.as_object().ok_or("XMind 子主题格式无效")?, depth + 1));
        }
      }
    }
  }
  Ok(reserved)
}
