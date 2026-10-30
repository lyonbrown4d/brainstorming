use super::{
  xmind_assets::Assets,
  xmind_import::{Ids, Warnings, own_extension},
  xmind_import_fields::{notes, parse_style, standard_metadata, structure},
};
use serde_json::{Map, Value, json};

#[allow(clippy::too_many_arguments)]
pub fn topic(
  source: &Map<String, Value>,
  topics: &mut Map<String, Value>,
  ids: &mut Ids,
  assets: &mut Assets<'_>,
  warnings: &mut Warnings,
  count: &mut usize,
  depth: usize,
  side: &str,
) -> Result<String, String> {
  *count += 1;
  if depth >= 128 || *count > 20_000 {
    return Err("XMind 主题数量或层级超过限制".into());
  }
  let id = ids.allocate(source.get("id").unwrap_or(&Value::Null), warnings);
  let title = source
    .get("title")
    .map(|value| value.as_str().ok_or("XMind 主题标题必须是文本"))
    .transpose()?
    .unwrap_or("");
  warnings.omitted(
    source,
    &[
      "id",
      "title",
      "children",
      "branch",
      "style",
      "structureClass",
      "notes",
      "image",
      "href",
      "extensions",
      "class",
      "labels",
      "markers",
    ],
  );
  let extension = own_extension(source, warnings)?;
  let style = parse_style(source.get("style"), warnings)?;
  let metadata = standard_metadata(source, warnings)?;
  let structure = if depth == 0 {
    None
  } else {
    structure(source.get("structureClass"), warnings)
  };
  let collapsed = source.get("branch") == Some(&json!("folded"));
  if source
    .get("branch")
    .is_some_and(|value| value != "folded" && value != "expanded")
  {
    warnings.add("不支持的 XMind 折叠状态已展开", 1);
  }
  // Reserve before descending so duplicate IDs cannot replace their ancestor.
  topics.insert(
    id.clone(),
    json!({"id":id,"title":title,"children":[],"collapsed":collapsed,"side":side}),
  );
  let mut children = Vec::new();
  if let Some(groups) = source.get("children") {
    let groups = groups.as_object().ok_or("XMind children 格式无效")?;
    if let Some(attached) = groups.get("attached") {
      for (index, child) in attached
        .as_array()
        .ok_or("XMind children.attached 必须是列表")?
        .iter()
        .enumerate()
      {
        let child_side = if depth == 0 {
          if index % 2 == 0 { "right" } else { "left" }
        } else {
          side
        };
        children.push(topic(
          child.as_object().ok_or("XMind 子主题格式无效")?,
          topics,
          ids,
          assets,
          warnings,
          count,
          depth + 1,
          child_side,
        )?);
      }
    }
    for (kind, entries) in groups {
      if kind == "attached" {
        continue;
      }
      let entries = entries.as_array().ok_or("XMind 附加主题必须是列表")?;
      if entries.is_empty() {
        continue;
      }
      let kind_name = match kind.as_str() {
        "detached" => "游离",
        "summary" => "概要",
        "callout" => "标注",
        _ => "其他类型",
      };
      *count += 1;
      if depth + 1 >= 128 || *count > 20_000 {
        return Err("XMind 主题数量或层级超过限制".into());
      }
      let group_id = ids.allocate(&Value::Null, warnings);
      let nested = entries
        .iter()
        .map(|child| {
          topic(
            child.as_object().ok_or("XMind 附加主题格式无效")?,
            topics,
            ids,
            assets,
            warnings,
            count,
            depth + 2,
            side,
          )
        })
        .collect::<Result<Vec<_>, _>>()?;
      let group_title = format!("导入的{kind_name}主题");
      topics.insert(
        group_id.clone(),
        json!({"id":group_id,"title":group_title,"children":nested,"collapsed":false,"side":side}),
      );
      children.push(group_id);
      warnings.add(
        &format!("XMind {kind_name}主题已保留为“{group_title}”分支，原位置或语义未保留"),
        entries.len(),
      );
    }
  }
  let mut result =
    json!({"id":id,"title":title,"children":children,"collapsed":collapsed,"side":side});
  if let Some(style) = style {
    result["style"] = style;
  }
  if let Some(metadata) = metadata {
    result["metadata"] = metadata;
  }
  if let Some(structure) = structure {
    result["structure"] = json!(structure);
  }
  if let Some(notes) = notes(source.get("notes"), warnings) {
    result["notes"] = json!(notes);
  }
  if let Some(image) = source.get("image") {
    let src = &image["src"];
    if let Some(asset) = assets.resource(src, true, None, None)? {
      if let Some((width, height)) = assets.image_size(&asset) {
        result["image"] = json!({"assetId":asset["id"],"width":width,"height":height});
      }
    } else {
      warnings.add("XMind 图片不是有效的内嵌资源或资源缺失，已跳过", 1);
    }
  }
  if let Some(href) = source.get("href")
    && result["metadata"]["link"].is_null()
  {
    if let Some(asset) = assets.resource(href, false, None, None)? {
      result["attachments"] = json!([asset["id"]]);
    } else {
      warnings.add(
        "XMind 附件或外部链接不是有效的内嵌资源或资源缺失，已跳过",
        1,
      );
    }
  }
  if let Some(extension) = extension {
    restore_extension(&mut result, &extension, assets)?;
  }
  topics.insert(id.clone(), result);
  Ok(id)
}

fn restore_extension(
  result: &mut Value,
  extension: &Map<String, Value>,
  assets: &mut Assets<'_>,
) -> Result<(), String> {
  if let Some(side) = extension.get("side") {
    if side != "left" && side != "right" {
      return Err("XMind 主题方向扩展无效".into());
    }
    result["side"] = side.clone();
  }
  for key in ["style", "metadata", "structure"] {
    if let Some(value) = extension.get(key) {
      result[key] = value.clone();
    }
  }
  if let Some(entries) = extension.get("attachments") {
    let entries = entries
      .as_array()
      .ok_or("XMind Brainstorming attachments 必须是列表")?;
    if entries.len() > 32 {
      return Err("XMind 主题附件超过 32 个".into());
    }
    let mut ids = Vec::new();
    for entry in entries {
      let asset = assets
        .resource(
          &entry["src"],
          false,
          entry.get("name"),
          entry.get("mimeType"),
        )?
        .ok_or("XMind Brainstorming 附件缺失或无效")?;
      ids.push(asset["id"].clone());
    }
    result["attachments"] = json!(ids);
  }
  if let Some(audio) = extension.get("audio") {
    let asset = assets
      .resource(
        &audio["src"],
        false,
        audio.get("name"),
        audio.get("mimeType"),
      )?
      .ok_or("XMind Brainstorming 音频缺失或无效")?;
    if result["metadata"].is_null() {
      result["metadata"] = json!({});
    }
    result["metadata"]["audioAssetId"] = asset["id"].clone();
  }
  if let Some(image) = extension.get("image") {
    let asset = assets
      .resource(
        &image["src"],
        true,
        image.get("name"),
        image.get("mimeType"),
      )?
      .ok_or("XMind Brainstorming 图片缺失或无效")?;
    result["image"] =
      json!({"assetId":asset["id"],"width":image["width"],"height":image["height"]});
  }
  Ok(())
}
