use super::{media::BackendServices, platform::RuntimeConfig};
use crate::{
  document_exports::DocumentExportService,
  export_image::ImageExportService,
  runtime::{ai::AIService, mcp::MCPService, notifications::NotificationService},
};
use fluxdi::{Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module};

static_module! {
    pub(super) struct IntegrationServices {
        external config: RuntimeConfig;
        #[scope(root)]
        ai: AIService = ai(config);
        #[scope(root)]
        mcp: MCPService = mcp();
        #[scope(root)]
        notifications: NotificationService = notifications(config);
        #[scope(root)]
        image_exports: ImageExportService = image_exports();
        #[scope(root)]
        document_exports: DocumentExportService = document_exports();
    }
}
fn document_exports() -> Result<Shared<DocumentExportService>, Error> {
  Ok(Shared::new(DocumentExportService::default()))
}
fn image_exports() -> Result<Shared<ImageExportService>, Error> {
  Ok(Shared::new(ImageExportService::default()))
}
fn ai(config: Shared<RuntimeConfig>) -> Result<Shared<AIService>, Error> {
  Ok(Shared::new(AIService::new(config.directory.clone())))
}
fn notifications(config: Shared<RuntimeConfig>) -> Result<Shared<NotificationService>, Error> {
  Ok(Shared::new(NotificationService::new(config.app.clone())))
}
fn mcp() -> Result<Shared<MCPService>, Error> {
  Ok(Shared::new(MCPService::default()))
}

pub(super) struct IntegrationModule(pub BackendServices);
impl Module for IntegrationModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      graph.ai()?;
      graph.mcp()?;
      graph.notifications()?;
      graph.image_exports()?;
      graph.document_exports()?;
      Ok(())
    })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      graph.document_exports()?.shutdown().await;
      graph.image_exports()?.shutdown().await;
      graph.notifications()?.shutdown();
      let mcp = graph.mcp()?;
      if let Some(app) = &graph.config()?.app {
        mcp.stop(app).await;
      } else {
        mcp.shutdown().await;
      }
      graph.ai()?.cancel_all().await;
      Ok(())
    })
  }
}
