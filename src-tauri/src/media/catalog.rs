use crate::{
  runtime::AppState,
  transport::{ObjectInfo, ReadFuture, ResourceBackend},
};
use serde_json::Value;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::RwLock;
use zeroize::Zeroizing;

#[derive(Clone)]
enum Location {
  Vault,
  Document { document_id: String, path: PathBuf },
}
#[derive(Clone)]
struct Entry {
  location: Location,
  info: ObjectInfo,
}
pub struct Catalog {
  state: Arc<AppState>,
  entries: RwLock<HashMap<String, Vec<Entry>>>,
  scan: tokio::sync::Mutex<()>,
}
impl Catalog {
  pub fn new(state: Arc<AppState>) -> Self {
    Self {
      state,
      entries: RwLock::new(HashMap::new()),
      scan: tokio::sync::Mutex::new(()),
    }
  }
  pub async fn transfer_to(&self, target: &Self, workbook: &Value) -> Result<(), String> {
    for sheet in workbook["sheets"].as_array().into_iter().flatten() {
      for asset in sheet["document"]["assets"]
        .as_object()
        .into_iter()
        .flat_map(|assets| assets.values())
      {
        for storage in [&asset["storage"], &asset["storage"]["preview"]] {
          if let Some(id) = storage["objectId"].as_str() {
            let (entry, _) = self.resolve(id).await?;
            target
              .entries
              .write()
              .await
              .entry(id.into())
              .or_default()
              .push(entry);
          }
        }
      }
    }
    Ok(())
  }
  pub async fn register_vault(&self, id: &str, length: u64, mime: &str) {
    let mut entries = self.entries.write().await;
    let items = entries.entry(id.into()).or_default();
    items.retain(|entry| !matches!(entry.location, Location::Vault));
    items.push(Entry {
      location: Location::Vault,
      info: ObjectInfo {
        byte_length: length,
        mime_type: mime.into(),
      },
    });
  }
  async fn current(&self, id: &str) -> Option<(Entry, Option<Zeroizing<String>>)> {
    let items = self
      .entries
      .read()
      .await
      .get(id)
      .cloned()
      .unwrap_or_default();
    let session = self.state.session.lock().await;
    for entry in items.into_iter().rev() {
      match &entry.location {
        Location::Vault => return Some((entry, None)),
        Location::Document { document_id, path }
          if session.sources.get(document_id) == Some(path) =>
        {
          let key = session.passwords.get(document_id).cloned();
          return Some((entry, key));
        }
        _ => (),
      }
    }
    None
  }
  async fn resolve(&self, id: &str) -> Result<(Entry, Option<Zeroizing<String>>), String> {
    crate::document::assert_object_id(id).map_err(|e| e.to_string())?;
    if let Some(found) = self.current(id).await {
      return Ok(found);
    }
    let _scan = self.scan.lock().await;
    if let Some(found) = self.current(id).await {
      return Ok(found);
    }
    let sources: Vec<_> = {
      let session = self.state.session.lock().await;
      session
        .sources
        .iter()
        .map(|(id, path)| (id.clone(), path.clone(), session.passwords.get(id).cloned()))
        .collect()
    };
    for (document_id, path, key) in sources {
      let Ok(workbook) = self
        .state
        .documents
        .read(&path, key.as_deref().map(|s| s.as_str()))
        .await
      else {
        // A closed or unreadable source cannot block resources in other documents.
        continue;
      };
      self.register_workbook(workbook, document_id, path).await?;
    }
    self
      .current(id)
      .await
      .ok_or_else(|| "资源未授权或所在文档已关闭".into())
  }
  async fn register_workbook(
    &self,
    workbook: Value,
    document_id: String,
    path: PathBuf,
  ) -> Result<(), String> {
    let entries =
      tokio::task::spawn_blocking(move || workbook_entries(workbook, document_id, path))
        .await
        .map_err(|_| "资源目录解析任务失败")?;
    let mut output = self.entries.write().await;
    for (id, entry) in entries {
      let items = output.entry(id).or_default();
      if let Location::Document { path, .. } = &entry.location {
        items.retain(|item| !matches!(&item.location,Location::Document { path:p,.. } if p==path));
      }
      items.push(entry);
    }
    Ok(())
  }
}
fn workbook_entries(workbook: Value, document_id: String, path: PathBuf) -> Vec<(String, Entry)> {
  let mut output = Vec::new();
  for sheet in workbook["sheets"].as_array().into_iter().flatten() {
    let document = &sheet["document"];
    let mut referenced = std::collections::HashSet::new();
    for topic in document["topics"]
      .as_object()
      .into_iter()
      .flat_map(|m| m.values())
    {
      if let Some(id) = topic["image"]["assetId"].as_str() {
        referenced.insert(id);
      }
      if let Some(id) = topic["metadata"]["audioAssetId"].as_str() {
        referenced.insert(id);
      }
      for id in topic["attachments"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
      {
        referenced.insert(id);
      }
    }
    for id in referenced {
      let asset = &document["assets"][id];
      let storage = &asset["storage"];
      for (storage, mime) in [
        (storage, asset["mimeType"].as_str()),
        (&storage["preview"], storage["preview"]["mimeType"].as_str()),
      ] {
        if let (Some(id), Some(length), Some(mime)) = (
          storage["objectId"].as_str(),
          storage["byteLength"].as_u64(),
          mime,
        ) {
          output.push((
            id.to_owned(),
            Entry {
              location: Location::Document {
                document_id: document_id.clone(),
                path: path.clone(),
              },
              info: ObjectInfo {
                byte_length: length,
                mime_type: mime.into(),
              },
            },
          ));
        }
      }
    }
  }
  output
}
impl ResourceBackend for Catalog {
  fn info<'a>(&'a self, id: &'a str) -> ReadFuture<'a, ObjectInfo> {
    Box::pin(async move { Ok(self.resolve(id).await?.0.info) })
  }
  fn read<'a>(&'a self, id: &'a str, offset: u64, length: u64) -> ReadFuture<'a, Vec<u8>> {
    Box::pin(async move {
      if length > crate::document::RESOURCE_CHUNK_BYTES as u64 {
        return Err("资源读取超过分块上限".into());
      }
      let (entry, key) = self.resolve(id).await?;
      match entry.location {
        Location::Vault => self.state.vault.read_range(id, offset, Some(length)).await,
        Location::Document { path, .. } => {
          self
            .state
            .documents
            .read_resource(
              path,
              id,
              offset,
              Some(length),
              key.as_deref().map(|s| s.as_str()),
            )
            .await
        }
      }
      .map_err(|e| e.to_string())
    })
  }
  fn tile<'a>(&'a self, id: &'a str, level: u32, x: u32, y: u32) -> ReadFuture<'a, Option<String>> {
    Box::pin(async move {
      let (entry, key) = self.resolve(id).await?;
      let tile_id = match &entry.location {
        Location::Vault => self.state.vault.image_tile(id, level, x, y).await,
        Location::Document { path, .. } => {
          self
            .state
            .documents
            .image_tile(path, id, level, x, y, key.as_deref().map(|s| s.as_str()))
            .await
        }
      }
      .map_err(|e| e.to_string())?;
      let Some(tile_id) = tile_id else {
        return Ok(None);
      };
      let info = match &entry.location {
        Location::Vault => self.state.vault.object_info(&tile_id).await,
        Location::Document { path, .. } => {
          self
            .state
            .documents
            .resource_info(path, &tile_id, key.as_deref().map(|s| s.as_str()))
            .await
        }
      }
      .map_err(|e| e.to_string())?;
      self
        .entries
        .write()
        .await
        .entry(tile_id.clone())
        .or_default()
        .push(Entry {
          location: entry.location,
          info: ObjectInfo {
            byte_length: info.byte_length,
            mime_type: "image/webp".into(),
          },
        });
      Ok(Some(tile_id))
    })
  }
}
