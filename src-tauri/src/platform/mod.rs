mod bootstrap;
#[cfg(feature = "e2e")]
mod fixtures;
mod initialization;
mod logging;
mod menu;
mod plugins;
mod request;
pub use bootstrap::run;
pub(crate) use plugins::{restore_window_state, save_window_state};

pub async fn finish_shutdown(app: &tauri::AppHandle) -> Result<(), String> {
    initialization::shutdown(app).await
}
