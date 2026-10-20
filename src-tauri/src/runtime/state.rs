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

pub struct AppState {
  #[cfg(feature = "e2e")]
  pub test_dialogs: tokio::sync::Mutex<std::collections::VecDeque<(String, Option<PathBuf>)>>,
  pub directory: PathBuf,
  pub documents: Arc<DocumentStore>,
  pub compute: Arc<crate::compute::ComputeService>,
  pub editor: Arc<crate::editor_engine::EditorEngine>,
  pub metadata: Arc<MetadataStore>,
  pub vault: Arc<ResourceVault>,
  pub session: Arc<Mutex<Session>>,
  pub recovery: Arc<Mutex<()>>,
  pub ai: Arc<AIService>,
  pub image_exports: Arc<crate::export_image::ImageExportService>,
  pub mcp: Arc<MCPService>,
  pub(crate) notifications: Arc<super::notifications::NotificationService>,
  pub search: Arc<SearchService>,
  pub language: Arc<RwLock<String>>,
  pub resource_origin: RwLock<String>,
}
impl AppState {
  pub fn set_resource_origin(&self, value: String) {
    if let Ok(mut origin) = self.resource_origin.write() {
      *origin = value;
    }
  }
}
