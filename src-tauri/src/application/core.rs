use super::{
  compute::ComputeServices, document::DocumentServices, integration::IntegrationServices,
  platform::RuntimeConfig, search::SearchServices, session::SessionService,
};
use crate::{
  document::DocumentStore,
  export_image::ImageExportService,
  runtime::{AppState, ai::AIService, mcp::MCPService, notifications::NotificationService},
  search::SearchService,
  storage::{MetadataStore, ResourceVault},
};
use fluxdi::{Error, Shared, static_module};
use std::sync::{RwLock, Weak};

static_module! {
    pub(super) struct CoreServices {
        import document: DocumentServices {
            config: RuntimeConfig;
            async metadata: MetadataStore;
            async vault: ResourceVault;
            documents: DocumentStore;
            async session: SessionService;
        };
        import searches: SearchServices {
            async search: SearchService;
        };
        import integrations: IntegrationServices {
            ai: AIService;
            mcp: MCPService;
            notifications: NotificationService;
            image_exports: ImageExportService;
        };
        import computations: ComputeServices {
            compute: crate::compute::ComputeService;
            editor: crate::editor_engine::EditorEngine;
        };
    }
}
impl AppState {
  /// Tauri's service facade is assembled from the typed DI container.
  /// The root reuses this container's context, so these are the same services
  /// that lifecycle modules initialize and shut down.
  pub(super) async fn from_container(
    container: Shared<Weak<CoreServices>>,
  ) -> Result<Shared<Self>, Error> {
    let services = container
      .upgrade()
      .ok_or_else(|| super::service_error("原生服务容器已释放"))?;
    let session = services.session().await?;
    Ok(Shared::new(Self {
      #[cfg(feature = "e2e")]
      test_dialogs: tokio::sync::Mutex::new(Default::default()),
      directory: services.config()?.directory.clone(),
      documents: services.documents()?,
      metadata: services.metadata().await?,
      vault: services.vault().await?,
      session: session.session.clone(),
      recovery: session.recovery.clone(),
      language: session.language.clone(),
      ai: services.ai()?,
      mcp: services.mcp()?,
      notifications: services.notifications()?,
      image_exports: services.image_exports()?,
      search: services.search().await?,
      compute: services.compute()?,
      editor: services.editor()?,
      resource_origin: RwLock::new("http://brainstorming.localhost".into()),
    }))
  }
}
