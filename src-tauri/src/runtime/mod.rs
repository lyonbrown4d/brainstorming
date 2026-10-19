pub(crate) mod ai;
mod ai_transport;
mod ai_validation;
mod atomic;
mod clipboard;
mod content_search;
pub mod dialogs;
mod dispatch;
mod document_previews;
pub mod documents;
mod image_exports;
pub mod input;
#[cfg(target_os = "ios")]
mod ios_save;
pub(crate) mod mcp;
mod mcp_tools;
mod mcp_transport;
mod mcp_validation;
pub mod native_files;
pub(crate) mod notifications;
mod recovery;
#[cfg(test)]
mod recovery_source_tests;
mod secrets;
pub mod session;
mod state;
mod window;

pub use dispatch::dispatch;
pub use state::AppState;
pub use window::{enqueue_open, handle_window_event};

#[cfg(test)]
mod tests;

pub async fn renderer_started(app: &tauri::AppHandle) {
  use tauri::Manager;
  if let Some(state) = app.try_state::<std::sync::Arc<AppState>>() {
    if state.search.clear().await.is_err() {
      tracing::error!("Content search reset failed");
    }
    state.mcp.stop(app).await;
    state.ai.cancel_all().await;
  }
}
