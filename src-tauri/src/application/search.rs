use super::{media::BackendServices, service_error};
use crate::search::SearchService;
use fluxdi::{Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module};

static_module! {
    pub(super) struct SearchServices {
        #[scope(root)]
        async search: SearchService = search();
    }
}
async fn search() -> Result<Shared<SearchService>, Error> {
    SearchService::new()
        .await
        .map(Shared::new)
        .map_err(service_error)
}
pub(super) struct SearchModule(pub BackendServices);
impl Module for SearchModule {
    fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
        let graph = self.0.clone();
        Box::pin(async move { graph.search().await.map(|_| ()) })
    }
    fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
        let graph = self.0.clone();
        Box::pin(async move {
            graph.search().await?.shutdown().await;
            Ok(())
        })
    }
}
