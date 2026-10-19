mod core;
mod document;
mod integration;
mod media;
mod platform;
mod search;
mod session;
mod storage;
#[cfg(test)]
mod tests;

use crate::{media::MediaState, runtime::AppState};
use fluxdi::{Application, Error, ErrorKind, Module};
use std::{path::PathBuf, sync::Arc};
use tauri::AppHandle;
use tokio::sync::{Mutex, OwnedRwLockReadGuard, RwLock};

struct BackendModule {
    graph: media::BackendServices,
    native: bool,
    // Root owns the container; providers hold weak references to avoid a cache cycle.
    _core: Arc<core::CoreServices>,
}
impl Module for BackendModule {
    fn imports(&self) -> Vec<Box<dyn Module>> {
        let mut modules: Vec<Box<dyn Module>> = vec![
            Box::new(platform::PlatformModule(self.graph.clone())),
            Box::new(storage::StorageModule(self.graph.clone())),
            Box::new(document::DocumentModule(self.graph.clone())),
            Box::new(integration::IntegrationModule(self.graph.clone())),
            Box::new(search::SearchModule(self.graph.clone())),
        ];
        if self.native {
            modules.push(Box::new(media::MediaModule(self.graph.clone())));
        }
        modules
    }
    fn on_start(
        &self,
        _: fluxdi::Shared<fluxdi::Injector>,
    ) -> fluxdi::module::ModuleLifecycleFuture {
        let graph = self.graph.clone();
        Box::pin(async move { graph.state().await.map(|_| ()) })
    }
}
fn services(directory: PathBuf, app: Option<AppHandle>) -> BackendModule {
    let native = app.is_some();
    let config = Arc::new(platform::RuntimeConfig { directory, app });
    let storage = storage::StorageServices::new(config.clone());
    let document = document::DocumentServices::new(storage);
    let integrations = integration::IntegrationServices::new(config);
    let core = Arc::new(core::CoreServices::new(
        document,
        search::SearchServices::new(),
        integrations,
    ));
    // Reuse the context while keeping the container reference in the cached
    // provider weak: Root -> cache -> strong container -> Root would leak.
    let graph = media::BackendServices::new((*core).clone(), Arc::new(Arc::downgrade(&core)))
        .in_context(core.injector());
    BackendModule {
        graph,
        native,
        _core: core,
    }
}

/// The container stays at the composition boundary. Commands receive typed services.
pub(crate) struct Backend {
    pub state: Arc<AppState>,
    pub media: Option<Arc<MediaState>>,
    lifecycle: Arc<Mutex<Application>>,
    admission: Arc<RwLock<bool>>,
}
impl Backend {
    pub async fn start(directory: PathBuf, app: Option<AppHandle>) -> Result<Self, String> {
        // Bootstrap owns native resources even if the caller drops its future.
        // An unclaimed Backend runs shutdown through Drop after initialization.
        tokio::spawn(Self::bootstrap(directory, app))
            .await
            .map_err(|_| "原生服务初始化任务失败")?
    }
    async fn bootstrap(directory: PathBuf, app: Option<AppHandle>) -> Result<Self, String> {
        let module = services(directory, app);
        let native = module.native;
        let graph = module.graph.clone();
        let mut application = Application::new(module);
        application.bootstrap().await.map_err(|e| e.to_string())?;
        let services = async {
            let state = graph.state().await?;
            let media = if native {
                Some(graph.media().await?)
            } else {
                None
            };
            Ok::<_, Error>((state, media))
        }
        .await;
        match services {
            Ok((state, media)) => Ok(Self {
                state,
                media,
                lifecycle: Arc::new(Mutex::new(application)),
                admission: Arc::new(RwLock::new(true)),
            }),
            Err(error) => {
                let cleanup = application.shutdown().await;
                Err(match cleanup {
                    Ok(()) => error.to_string(),
                    Err(cleanup) => Error::bootstrap_aggregate(vec![error, cleanup]).to_string(),
                })
            }
        }
    }
    pub async fn acquire(&self) -> Result<OwnedRwLockReadGuard<bool>, String> {
        let lease = self.admission.clone().read_owned().await;
        if !*lease {
            return Err("原生服务已关闭".into());
        }
        Ok(lease)
    }
    pub async fn shutdown(&self) -> Result<(), String> {
        tokio::spawn(stop_owned(
            self.lifecycle.clone(),
            self.admission.clone(),
            self.state.clone(),
            self.media.clone(),
        ))
        .await
        .map_err(|_| "原生服务关闭任务失败")?
    }
}
impl Drop for Backend {
    fn drop(&mut self) {
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            let work = stop_owned(
                self.lifecycle.clone(),
                self.admission.clone(),
                self.state.clone(),
                self.media.clone(),
            );
            runtime.spawn(async move {
                if let Err(error) = work.await {
                    tracing::error!("Native service cleanup failed: {error}");
                }
            });
        }
    }
}
async fn stop_owned(
    lifecycle: Arc<Mutex<Application>>,
    admission: Arc<RwLock<bool>>,
    state: Arc<AppState>,
    media: Option<Arc<MediaState>>,
) -> Result<(), String> {
    // Revoke producers before draining commands, including pending preview
    // and AI requests. The writer prevents new commands during teardown.
    if let Some(media) = media {
        media.revoke();
    }
    state.ai.cancel_all().await;
    state.mcp.shutdown().await;
    let mut open = admission.write().await;
    *open = false;
    lifecycle
        .lock()
        .await
        .shutdown()
        .await
        .map_err(|e| e.to_string())
}

fn service_error(error: impl std::fmt::Display) -> Error {
    Error::new(ErrorKind::ModuleLifecycleFailed, error.to_string())
}
