use super::{Result, catalog::Catalog};
use crate::transport::ResourceBackend;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{collections::HashSet, sync::Arc};

const ENTRY_LIMIT: u64 = 8 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 24 * 1024 * 1024;

pub async fn hydrate(catalog: &Arc<Catalog>, mut workbook: Value, original: bool) -> Result<Value> {
  crate::document::validate_workbook(&workbook).map_err(|error| error.to_string())?;
  let mut total = 0u64;
  for sheet in workbook["sheets"].as_array_mut().ok_or("画布列表无效")? {
    let document = &mut sheet["document"];
    let mut referenced = HashSet::new();
    let mut images = HashSet::new();
    for topic in document["topics"]
      .as_object()
      .ok_or("主题列表无效")?
      .values()
    {
      if let Some(id) = topic["image"]["assetId"].as_str() {
        referenced.insert(id.to_string());
        images.insert(id.to_string());
      }
      if let Some(id) = topic["metadata"]["audioAssetId"].as_str() {
        referenced.insert(id.to_string());
      }
      for id in topic["attachments"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
      {
        referenced.insert(id.to_string());
      }
    }
    if referenced.is_empty() {
      continue;
    }
    let assets = document["assets"].as_object_mut().ok_or("资源列表无效")?;
    for id in referenced {
      let asset = assets.get_mut(&id).ok_or("主题引用的资源不存在")?;
      let Some(storage) = asset.get("storage") else {
        continue;
      };
      if !original && !images.contains(&id) {
        continue;
      }
      let selected = if original {
        storage
      } else {
        storage.get("preview").unwrap_or(storage)
      };
      let object_id = selected["objectId"]
        .as_str()
        .ok_or("资源对象标识无效")?
        .to_owned();
      let expected = selected["byteLength"].as_u64().ok_or("资源对象长度无效")?;
      if expected > ENTRY_LIMIT
        || total
          .checked_add(expected)
          .is_none_or(|size| size > TOTAL_LIMIT)
      {
        return Err("交换格式资源超过单个 8 MiB 或总计 24 MiB 限制".into());
      }
      let info = catalog.info(&object_id).await?;
      if info.byte_length != expected {
        return Err("资源对象长度与文档不一致".into());
      }
      let mime = if original {
        asset["mimeType"].as_str().ok_or("资源 MIME 类型无效")?
      } else {
        selected["mimeType"]
          .as_str()
          .unwrap_or(asset["mimeType"].as_str().ok_or("资源 MIME 类型无效")?)
      }
      .to_owned();
      if info.mime_type != mime {
        return Err("资源对象类型与文档不一致".into());
      }
      let name = asset["name"].clone();
      let mut bytes = Vec::with_capacity(expected as usize);
      while bytes.len() < expected as usize {
        let remaining = expected as usize - bytes.len();
        let chunk = catalog
          .read(
            &object_id,
            bytes.len() as u64,
            remaining.min(crate::document::RESOURCE_CHUNK_BYTES) as u64,
          )
          .await?;
        if chunk.is_empty() || chunk.len() > remaining {
          return Err("资源对象读取不完整".into());
        }
        bytes.extend_from_slice(&chunk);
      }
      total += expected;
      *asset = json!({"id":id,"name":name,"mimeType":mime,"data":STANDARD.encode(bytes)});
    }
  }
  Ok(workbook)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{application::Backend, document_fixture as fixture};

  #[tokio::test]
  async fn hydrates_one_sheet_when_another_has_no_assets() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Backend::start(directory.path().join("state"), None)
      .await
      .unwrap();
    let image = STANDARD
      .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")
      .unwrap();
    let stored = backend
      .state
      .vault
      .import_bytes(image.clone())
      .await
      .unwrap();
    let catalog = Arc::new(Catalog::new(backend.state.clone()));
    catalog
      .register_vault(&stored.object_id, stored.byte_length, "image/png")
      .await;
    let mut workbook = fixture::workbook();
    workbook["sheets"][0]["document"]["topics"]["root"]["image"] =
      json!({"assetId":"image","width":1,"height":1});
    workbook["sheets"][0]["document"]["assets"] = json!({"image":{
      "id":"image","name":"image.png","mimeType":"image/png",
      "storage":{"objectId":stored.object_id,"byteLength":stored.byte_length}
    }});
    workbook["sheets"][1]["document"]
      .as_object_mut()
      .unwrap()
      .remove("assets");
    let hydrated = hydrate(&catalog, workbook, false).await.unwrap();
    assert_eq!(
      hydrated["sheets"][0]["document"]["assets"]["image"]["data"],
      STANDARD.encode(image)
    );
    assert!(hydrated["sheets"][1]["document"].get("assets").is_none());
    backend.shutdown().await.unwrap();
  }
}
