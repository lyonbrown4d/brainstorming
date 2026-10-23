use super::{core::CoreServices, platform::RuntimeConfig, service_error, session::SessionService};
use crate::{
  document::DocumentStore,
  document_exports::DocumentExportService,
  export_image::ImageExportService,
  media::MediaState,
  runtime::{AppState, ai::AIService, mcp::MCPService, notifications::NotificationService},
  search::SearchService,
  storage::{MetadataStore, ResourceVault},
};
use fluxdi::{Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module};
use std::sync::Weak;

static_module! {
    pub(super) struct BackendServices {
        import core: CoreServices {
            config: RuntimeConfig;
            async metadata: MetadataStore;
            async vault: ResourceVault;
            documents: DocumentStore;
            compute: crate::compute::ComputeService;
            editor: crate::editor_engine::EditorEngine;
            async session: SessionService;
            async search: SearchService;
            ai: AIService;
            mcp: MCPService;
            notifications: NotificationService;
            image_exports: ImageExportService;
            document_exports: DocumentExportService;
        };
        external core_services: Weak<CoreServices>;
        #[scope(root)]
        async state: AppState = AppState::from_container(core_services);
        #[scope(root)]
        async media: MediaState = media(config, state);
    }
}
async fn media(
  config: Shared<RuntimeConfig>,
  state: Shared<AppState>,
) -> Result<Shared<MediaState>, Error> {
  let app = config
    .app
    .clone()
    .ok_or_else(|| service_error("原生窗口尚未创建"))?;
  MediaState::new(app, state)
    .await
    .map(Shared::new)
    .map_err(service_error)
}

pub(super) struct MediaModule(pub BackendServices);
impl Module for MediaModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move { graph.media().await.map(|_| ()) })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      graph.media().await?.shutdown().await;
      Ok(())
    })
  }
}
