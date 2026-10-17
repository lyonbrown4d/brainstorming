use crate::{application::Backend, runtime::AppState};
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared},
};
use std::sync::{
    Arc, RwLock,
    atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, OnceCell};

type Startup = Shared<BoxFuture<'static, Result<Arc<Backend>, String>>>;
#[derive(Default)]
pub struct Initialization {
    backend: OnceCell<Arc<Backend>>,
    attempt: Mutex<Option<Startup>>,
    stopping: AtomicBool,
    exit_scheduled: AtomicBool,
    exit_ready: AtomicBool,
    phase: RwLock<Option<&'static str>>,
}

pub async fn ready(app: &AppHandle) -> Result<Arc<AppState>, String> {
    let initialization = app.state::<Initialization>();
    if initialization.stopping.load(Ordering::Acquire) {
        return Err("原生服务已关闭".into());
    }
    let backend = if let Some(backend) = initialization.backend.get() {
        backend.clone()
    } else {
        let attempt = {
            let mut slot = initialization.attempt.lock().await;
            if initialization.stopping.load(Ordering::Acquire) {
                return Err("原生服务已关闭".into());
            }
            // A previous waiter may have published while this caller queued.
            if let Some(backend) = initialization.backend.get() {
                drop(slot);
                let _lease = backend.acquire().await?;
                return Ok(backend.state.clone());
            }
            slot.get_or_insert_with(|| {
                let handle = app.clone();
                let task = tokio::spawn(async move { initialize(&handle).await.map(Arc::new) });
                async move { task.await.map_err(|_| "原生服务初始化任务失败")? }
                    .boxed()
                    .shared()
            })
            .clone()
        };
        let result = attempt.clone().await;
        let mut slot = initialization.attempt.lock().await;
        if let Ok(backend) = &result {
            let _ = initialization.backend.set(backend.clone());
        }
        if slot
            .as_ref()
            .is_some_and(|current| current.ptr_eq(&attempt))
        {
            *slot = None;
        }
        result?
    };
    let _lease = backend.acquire().await?;
    Ok(backend.state.clone())
}
async fn initialize(app: &AppHandle) -> Result<Backend, String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backend = Backend::start(directory, Some(app.clone())).await?;
    let language = backend
        .state
        .language
        .read()
        .map_err(|_| "语言设置不可用")?
        .clone();
    let initialization = app.state::<Initialization>();
    if initialization.stopping.load(Ordering::Acquire) {
        backend.shutdown().await?;
        return Err("原生服务已关闭".into());
    }
    // Publish services only after native UI setup succeeds; failures stay retryable.
    if let Err(error) = super::menu::install_with_language(app, &language) {
        let _ = backend.shutdown().await;
        return Err(error.to_string());
    }
    app.manage(backend.state.clone());
    if let Some(media) = &backend.media {
        app.manage(media.clone());
    }
    let _ = app.emit_to("splash", "native:language", language);
    Ok(backend)
}
pub async fn acquire(app: &AppHandle) -> Result<tokio::sync::OwnedRwLockReadGuard<bool>, String> {
    app.state::<Initialization>()
        .backend
        .get()
        .ok_or("原生服务尚未初始化")?
        .acquire()
        .await
}
pub async fn shutdown(app: &AppHandle) -> Result<(), String> {
    let initialization = app.state::<Initialization>();
    initialization.stopping.store(true, Ordering::Release);
    let attempt = initialization.attempt.lock().await.clone();
    if let Some(attempt) = attempt
        && let Ok(backend) = attempt.await
    {
        backend.shutdown().await?;
    }
    if let Some(backend) = initialization.backend.get() {
        backend.shutdown().await?;
    }
    Ok(())
}
pub fn exit_ready(app: &AppHandle) -> bool {
    app.state::<Initialization>()
        .exit_ready
        .load(Ordering::Acquire)
}
pub fn exit(app: &AppHandle, code: i32) {
    if app
        .state::<Initialization>()
        .exit_scheduled
        .swap(true, Ordering::AcqRel)
    {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = shutdown(&app).await {
            tracing::error!("Native shutdown failed: {error}");
        }
        app.state::<Initialization>()
            .exit_ready
            .store(true, Ordering::Release);
        app.exit(code);
    });
}
pub fn phase(app: &AppHandle) -> &'static str {
    app.state::<Initialization>()
        .phase
        .read()
        .ok()
        .and_then(|value| *value)
        .unwrap_or("loading")
}
pub fn set_phase(app: &AppHandle, phase: &'static str) {
    if let Ok(mut value) = app.state::<Initialization>().phase.write() {
        *value = Some(phase);
    }
    let _ = app.emit_to("splash", "native:startup-phase", phase);
}
