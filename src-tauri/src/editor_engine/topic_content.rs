use super::helpers::*;
use serde_json::{Value, json};

fn with_asset(document: &mut Value, asset: &Value) -> Result<String, String> {
  let asset_id = id(asset, "id")?;
  object(asset)?;
  let assets = object_mut(
    document
      .as_object_mut()
      .ok_or("文档无效")?
      .entry("assets")
      .or_insert_with(|| json!({})),
  )?;
  if let Some(existing) = assets.get(&asset_id) {
    if existing != asset {
      return Err("资源 ID 已被其他内容占用".to_owned());
    }
  } else {
    assets.insert(asset_id.clone(), asset.clone());
  }
  Ok(asset_id)
}

pub(super) fn apply(document: &mut Value, command: &Value) -> Result<bool, String> {
  let kind = string(command, "type")?;
  if !matches!(
    kind,
    "setTopicNotes"
      | "setTopicImage"
      | "removeTopicImage"
      | "addTopicAttachment"
      | "removeTopicAttachment"
      | "setTopicAudio"
  ) {
    return Ok(false);
  }
  let topic_id = id(command, "topicId")?;
  topic(document, &topic_id)?;
  match kind {
    "setTopicNotes" => {
      let notes = string(command, "notes")?;
      if notes.trim().is_empty() {
        object_mut(topic_mut(document, &topic_id)?)?.remove("notes");
      } else {
        topic_mut(document, &topic_id)?["notes"] = json!(notes);
      }
    }
    "setTopicImage" => {
      let asset = field(command, "asset")?;
      let width = field(command, "width")?.as_u64().ok_or("图片宽度无效")?;
      let height = field(command, "height")?.as_u64().ok_or("图片高度无效")?;
      if width == 0
        || height == 0
        || width > 65_536
        || height > 65_536
        || width * height > 268_402_689
      {
        return Err("图片尺寸无效".to_owned());
      }
      let asset_id = with_asset(document, asset)?;
      topic_mut(document, &topic_id)?["image"] =
        json!({"assetId":asset_id,"width":width,"height":height});
    }
    "removeTopicImage" => {
      object_mut(topic_mut(document, &topic_id)?)?.remove("image");
    }
    "addTopicAttachment" => {
      let asset_id = with_asset(document, field(command, "asset")?)?;
      let topic = topic_mut(document, &topic_id)?;
      let attachments = topic
        .as_object_mut()
        .ok_or("主题无效")?
        .entry("attachments")
        .or_insert_with(|| json!([]));
      if !array(attachments)?.contains(&json!(asset_id)) {
        array_mut(attachments)?.push(json!(asset_id));
      }
    }
    "removeTopicAttachment" => {
      let asset_id = id(command, "assetId")?;
      let topic = topic_mut(document, &topic_id)?;
      if let Some(attachments) = topic.get_mut("attachments").and_then(Value::as_array_mut) {
        attachments.retain(|id| id != &asset_id);
        if attachments.is_empty() {
          object_mut(topic)?.remove("attachments");
        }
      }
    }
    "setTopicAudio" => {
      let asset_id = with_asset(document, field(command, "asset")?)?;
      let topic = topic_mut(document, &topic_id)?;
      let metadata = topic
        .as_object_mut()
        .ok_or("主题无效")?
        .entry("metadata")
        .or_insert_with(|| json!({}));
      metadata["audioAssetId"] = json!(asset_id);
    }
    _ => unreachable!(),
  }
  Ok(true)
}
