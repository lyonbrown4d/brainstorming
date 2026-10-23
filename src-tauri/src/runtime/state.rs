use super::{ai::AIService, mcp::MCPService, session::Session};
use crate::{
  document::DocumentStore,
  search::SearchService,
  storage::{MetadataStore, ResourceVault},
};
use std::{
  path::PathBuf,
  sync::{Arc, RwLock},
};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
  #[cfg(feature = "e2e")]
  pub test_dialogs: Arc<tokio::sync::Mutex<std::collections::VecDeque<(String, Option<PathBuf>)>>>,
  pub directory: PathBuf,
  pub documents: Arc<DocumentStore>,
  pub compute: Arc<crate::compute::ComputeService>,
  pub editor: Arc<crate::editor_engine::EditorEngine>,
  pub metadata: Arc<MetadataStore>,
  pub vault: Arc<ResourceVault>,
  pub session: Arc<Mutex<Session>>,
  pub recovery: Arc<Mutex<()>>,
  pub ai: Arc<AIService>,
  pub document_exports: Arc<crate::document_exports::DocumentExportService>,
  pub image_exports: Arc<crate::export_image::ImageExportService>,
  pub mcp: Arc<MCPService>,
  pub(crate) notifications: Arc<super::notifications::NotificationService>,
  pub search: Arc<SearchService>,
  pub language: Arc<RwLock<String>>,
  pub resource_origin: Arc<RwLock<String>>,
  pub window_id: String,
  pub windows: Arc<super::windows::WindowSessions>,
}
impl AppState {
  pub async fn for_window(&self, label: &str) -> Result<Arc<Self>, String> {
    let slot = self.windows.get(label).await?;
    Ok(Arc::new(Self {
      session: slot.session,
      search: slot.search,
      mcp: slot.mcp,
      resource_origin: slot.resource_origin,
      window_id: label.into(),
      ..self.clone()
    }))
  }
  pub fn set_resource_origin(&self, value: String) {
    if let Ok(mut origin) = self.resource_origin.write() {
      *origin = value;
    }
  }
}
