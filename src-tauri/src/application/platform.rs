use super::{media::BackendServices, service_error};
use fluxdi::{Injector, Module, Shared, module::ModuleLifecycleFuture};
use std::path::PathBuf;
use tauri::AppHandle;

pub(super) struct RuntimeConfig {
  pub directory: PathBuf,
  pub app: Option<AppHandle>,
}
pub(super) struct PlatformModule(pub BackendServices);
impl Module for PlatformModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      tokio::fs::create_dir_all(&graph.config()?.directory)
        .await
        .map_err(service_error)
    })
  }
}
