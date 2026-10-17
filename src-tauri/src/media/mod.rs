mod catalog;
mod dispatch;
mod export;
mod import;
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
    app: AppHandle,
    state: Arc<AppState>,
    importer: Arc<Importer>,
    previews: Arc<preview::PreviewQueue>,
    server: ResourceServer,
    grants: Mutex<HashMap<PathBuf, Instant>>,
    raw_documents: tokio::sync::Mutex<Vec<temporary::Directory>>,
}
impl MediaState {
    pub async fn new(app: AppHandle, state: Arc<AppState>) -> Result<Self> {
        let catalog = Arc::new(catalog::Catalog::new(state.clone()));
        let importer = Arc::new(Importer::new(state.clone(), catalog.clone()));
        let window = app.get_webview_window("main").ok_or("主窗口尚未创建")?;
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
        let previews = preview::PreviewQueue::new(app.clone(), importer.clone()).await?;
        Ok(Self {
            app,
            state,
            importer,
            previews,
            server,
            grants: Mutex::new(HashMap::new()),
            raw_documents: Default::default(),
        })
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
    pub fn revoke(&self) {
        self.server.revoke();
        self.previews.revoke();
    }
    pub async fn shutdown(&self) {
        self.revoke();
        self.previews.shutdown().await;
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
