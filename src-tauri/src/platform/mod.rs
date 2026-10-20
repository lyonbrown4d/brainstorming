mod bootstrap;
pub(crate) mod compute;
#[cfg(feature = "e2e")]
pub(crate) mod fixtures;
mod initialization;
mod logging;
mod menu;
mod plugins;
pub(crate) mod request;
pub use bootstrap::run;
pub(crate) use plugins::{restore_window_state, save_window_state};

pub async fn finish_shutdown(app: &tauri::AppHandle) -> Result<(), String> {
  initialization::shutdown(app).await
}

pub(crate) mod wire;
