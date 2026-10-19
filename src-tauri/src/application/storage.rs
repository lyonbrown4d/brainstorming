use super::{media::BackendServices, platform::RuntimeConfig, service_error};
use crate::storage::{MetadataStore, ResourceVault};
use fluxdi::{Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module};

static_module! {
    pub(super) struct StorageServices {
        external config: RuntimeConfig;
        #[scope(root)]
        async metadata: MetadataStore = metadata(config);
        #[scope(root)]
        async vault: ResourceVault = vault(config);
    }
}
async fn metadata(config: Shared<RuntimeConfig>) -> Result<Shared<MetadataStore>, Error> {
  MetadataStore::new(config.directory.join("brainstorming-native-v2.sqlite"))
    .await
    .map(Shared::new)
    .map_err(service_error)
}
async fn vault(config: Shared<RuntimeConfig>) -> Result<Shared<ResourceVault>, Error> {
  ResourceVault::new(config.directory.join("resource-vault"))
    .await
    .map(Shared::new)
    .map_err(service_error)
}

pub(super) struct StorageModule(pub BackendServices);
struct MetadataModule(BackendServices);
struct VaultModule(BackendServices);
impl Module for StorageModule {
  fn imports(&self) -> Vec<Box<dyn Module>> {
    vec![
      Box::new(MetadataModule(self.0.clone())),
      Box::new(VaultModule(self.0.clone())),
    ]
  }
}
impl Module for MetadataModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move { graph.metadata().await.map(|_| ()) })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      graph
        .metadata()
        .await?
        .shutdown()
        .await
        .map_err(service_error)
    })
  }
}
impl Module for VaultModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move { graph.vault().await.map(|_| ()) })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move { graph.vault().await?.shutdown().await.map_err(service_error) })
  }
}
