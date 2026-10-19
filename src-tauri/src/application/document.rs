use super::{
  media::BackendServices, platform::RuntimeConfig, service_error, session::SessionService,
  storage::StorageServices,
};
use crate::{
  document::DocumentStore,
  storage::{MetadataStore, ResourceVault},
};
use fluxdi::{Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module};

static_module! {
    pub(super) struct DocumentServices {
        import storage: StorageServices {
            config: RuntimeConfig;
            async metadata: MetadataStore;
            async vault: ResourceVault;
        };
        #[scope(root)]
        documents: DocumentStore = documents();
        #[scope(root)]
        async session: SessionService = session(metadata);
    }
}
fn documents() -> Result<Shared<DocumentStore>, Error> {
  Ok(Shared::new(DocumentStore::new()))
}
async fn session(metadata: Shared<MetadataStore>) -> Result<Shared<SessionService>, Error> {
  SessionService::new(&metadata)
    .await
    .map(Shared::new)
    .map_err(service_error)
}

pub(super) struct DocumentModule(pub BackendServices);
struct DocumentStoreModule(BackendServices);
impl Module for DocumentModule {
  fn imports(&self) -> Vec<Box<dyn Module>> {
    vec![Box::new(DocumentStoreModule(self.0.clone()))]
  }
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      graph.session().await?.start().await;
      Ok(())
    })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      let session = graph.session().await?;
      let documents = graph.documents()?;
      session.shutdown(&documents).await.map_err(service_error)
    })
  }
}
impl Module for DocumentStoreModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move { graph.documents().map(|_| ()) })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move { graph.documents()?.shutdown().await.map_err(service_error) })
  }
}
