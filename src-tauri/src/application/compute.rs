use super::{media::BackendServices, service_error};
use crate::{compute::ComputeService, editor_engine::EditorEngine};
use fluxdi::{Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module};

static_module! {
  pub(super) struct ComputeServices {
    #[scope(root)]
    compute: ComputeService = compute();
    #[scope(root)]
    editor: EditorEngine = editor();
  }
}
fn compute() -> Result<Shared<ComputeService>, Error> {
  Ok(Shared::new(ComputeService::default()))
}
fn editor() -> Result<Shared<EditorEngine>, Error> {
  Ok(Shared::new(EditorEngine::default()))
}
pub(super) struct ComputeModule(pub BackendServices);
impl Module for ComputeModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      graph.compute()?;
      graph.editor()?;
      Ok(())
    })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let graph = self.0.clone();
    Box::pin(async move {
      graph.compute()?.shutdown().await;
      graph.editor()?.shutdown().await.map_err(service_error)?;
      Ok(())
    })
  }
}
