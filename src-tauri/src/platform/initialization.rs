use crate::{media::MediaState, runtime::AppState};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::OnceCell;

#[derive(Default)]
pub struct Initialization {
    state: OnceCell<Arc<AppState>>,
    phase: RwLock<Option<&'static str>>,
}

pub async fn ready(app: &AppHandle) -> Result<Arc<AppState>, String> {
    let initialization = app.state::<Initialization>();
    initialization
        .state
        .get_or_try_init(|| async {
            let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let state = Arc::new(AppState::new(directory).await?);
            let media = MediaState::new(app.clone(), state.clone()).await?;
            app.manage(state.clone());
            app.manage(Arc::new(media));
            super::menu::install(app).map_err(|e| e.to_string())?;
            let language = state.language.read().map_err(|_| "语言设置不可用")?.clone();
            let _ = app.emit_to("splash", "native:language", language);
            Ok(state)
        })
        .await
        .cloned()
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
