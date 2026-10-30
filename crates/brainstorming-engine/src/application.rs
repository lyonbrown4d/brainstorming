use crate::{compute::ComputeService, document_exports::DocumentExportService};
use fluxdi::{
  Application, Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module,
};

static_module! {
  pub struct ExportServices {
    #[scope(root)]
    compute: ComputeService = compute();
    #[scope(root)]
    exports: DocumentExportService = exports();
  }
}
fn compute() -> Result<Shared<ComputeService>, Error> {
  Ok(Shared::new(ComputeService::default()))
}
fn exports() -> Result<Shared<DocumentExportService>, Error> {
  Ok(Shared::new(DocumentExportService::default()))
}
struct ExportModule(ExportServices);
impl Module for ExportModule {
  fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let services = self.0.clone();
    Box::pin(async move {
      services.compute()?;
      services.exports()?;
      Ok(())
    })
  }
  fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
    let services = self.0.clone();
    Box::pin(async move {
      services.exports()?.begin_shutdown();
      services.exports()?.shutdown().await;
      services.compute()?.shutdown().await;
      Ok(())
    })
  }
}
pub struct ExportApplication {
  pub compute: Shared<ComputeService>,
  pub exports: Shared<DocumentExportService>,
  lifecycle: Application,
}
impl ExportApplication {
  pub async fn start() -> Result<Self, String> {
    let services = ExportServices::new();
    let mut lifecycle = Application::new(ExportModule(services.clone()));
    lifecycle.bootstrap().await.map_err(|e| e.to_string())?;
    let result = (|| Ok::<_, Error>((services.compute()?, services.exports()?)))();
    match result {
      Ok((compute, exports)) => Ok(Self {
        compute,
        exports,
        lifecycle,
      }),
      Err(error) => {
        let _ = lifecycle.shutdown().await;
        Err(error.to_string())
      }
    }
  }
  pub async fn shutdown(&mut self) -> Result<(), String> {
    self.lifecycle.shutdown().await.map_err(|e| e.to_string())
  }
}
