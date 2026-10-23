mod catalog;
#[cfg(test)]
mod catalog_tests;
mod compute_resources;
mod derivative_cache;
mod dispatch;
mod export;
mod import;
#[cfg(test)]
mod import_cache_tests;
mod import_derivatives;
#[cfg(test)]
mod import_tests;
mod network;
mod preview;
mod preview_state;
mod snapshot;
mod snapshot_html;
mod temporary;
mod vips;
mod vips_ffi;

use crate::{runtime::AppState, transport::ResourceServer};
pub use import::Importer;
use std::{
  collections::HashMap,
  path::PathBuf,
  sync::{Arc, Mutex},
  time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
pub type Result<T> = std::result::Result<T, String>;
pub struct MediaState {
  windows: tokio::sync::Mutex<HashMap<String, Arc<MediaState>>>,
  app: AppHandle,
  state: Arc<AppState>,
  importer: Arc<Importer>,
  previews: Arc<preview::PreviewQueue>,
  server: Mutex<Option<ResourceServer>>,
  grants: Mutex<HashMap<PathBuf, Instant>>,
  raw_documents: tokio::sync::Mutex<Vec<temporary::Directory>>,
}
impl MediaState {
  pub(crate) async fn hydrate_workbook(
    &self,
    workbook: serde_json::Value,
    original: bool,
  ) -> Result<serde_json::Value> {
    compute_resources::hydrate(&self.importer.catalog, workbook, original).await
  }
  pub async fn new(app: AppHandle, state: Arc<AppState>) -> Result<Self> {
    let catalog = Arc::new(catalog::Catalog::new(state.clone()));
    let importer = Arc::new(Importer::new(state.clone(), catalog.clone()));
    let window = app
      .get_webview_window(&state.window_id)
      .ok_or("应用窗口尚未创建")?;
    let url = window.url().map_err(|_| "主窗口地址不可用")?;
    let origin = if matches!(url.scheme(), "http" | "https") {
      url.origin().ascii_serialization()
    } else {
      format!(
        "{}://{}",
        url.scheme(),
        url.host_str().ok_or("主窗口来源无效")?
      )
    };
    let server = ResourceServer::start(catalog, origin).await?;
    state.set_resource_origin(server.origin.clone());
    let previews = match preview::PreviewQueue::new(app.clone(), importer.clone()).await {
      Ok(previews) => previews,
      Err(error) => {
        server.shutdown().await;
        return Err(error);
      }
    };
    Ok(Self {
      windows: Default::default(),
      app,
      state,
      importer,
      previews,
      server: Mutex::new(Some(server)),
      grants: Mutex::new(HashMap::new()),
      raw_documents: Default::default(),
    })
  }
  pub async fn for_window(self: &Arc<Self>, state: Arc<AppState>) -> Result<Arc<Self>> {
    if state.window_id == self.state.window_id {
      return Ok(self.clone());
    }
    let mut windows = self.windows.lock().await;
    if let Some(media) = windows.get(&state.window_id) {
      return Ok(media.clone());
    }
    let media = Arc::new(Self::new(self.app.clone(), state.clone()).await?);
    windows.insert(state.window_id.clone(), media.clone());
    Ok(media)
  }
  pub async fn transfer_document(&self, target: &Self, workbook: &serde_json::Value) -> Result<()> {
    self
      .importer
      .catalog
      .transfer_to(&target.importer.catalog, workbook)
      .await
  }
  pub async fn remove_window(&self, label: &str) {
    if let Some(media) = self.windows.lock().await.remove(label) {
      media.shutdown_local().await;
    } else if label == self.state.window_id {
      self.shutdown_local().await;
    }
  }
  /// Only a native Tauri drop event may create path capabilities.
  pub fn grant_paths(&self, paths: Vec<PathBuf>) {
    if let Ok(mut grants) = self.grants.lock() {
      grants.retain(|_, expires| *expires > Instant::now());
      for path in paths.into_iter().take(32) {
        if grants.len() >= 256 {
          break;
        }
        if path.is_absolute() {
          grants.insert(path, Instant::now() + Duration::from_secs(120));
        }
      }
    }
  }
  pub async fn revoke_all(&self) {
    for media in self.windows.lock().await.values() {
      media.revoke();
    }
    self.revoke();
  }
  pub fn revoke(&self) {
    if let Ok(server) = self.server.lock()
      && let Some(server) = &*server
    {
      server.revoke();
    }
    self.previews.revoke();
  }
  pub async fn shutdown(&self) {
    let windows = std::mem::take(&mut *self.windows.lock().await);
    for media in windows.values() {
      media.shutdown_local().await;
    }
    self.shutdown_local().await;
  }
  async fn shutdown_local(&self) {
    self.revoke();
    self.previews.shutdown().await;
    let server = self.server.lock().ok().and_then(|mut server| server.take());
    if let Some(server) = server {
      server.shutdown().await;
    }
    for directory in std::mem::take(&mut *self.raw_documents.lock().await) {
      let _ = directory.close().await;
    }
  }
  pub async fn dispatch(
    &self,
    method: &str,
    args: serde_json::Value,
  ) -> Option<Result<serde_json::Value>> {
    dispatch::dispatch(self, method, args).await
  }
}
