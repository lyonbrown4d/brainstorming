pub(crate) mod ai;
mod ai_transport;
mod ai_validation;
pub(crate) mod atomic;
mod clipboard;
pub(crate) mod compute;
pub(crate) mod compute_previews;
mod content_search;
pub mod dialogs;
mod dispatch;
mod document_previews;
mod document_security;
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
mod recovery_security;
#[cfg(test)]
mod recovery_source_tests;
mod secrets;
pub mod session;
mod state;
pub(crate) mod window;
pub(crate) mod window_lifecycle;
mod window_transfer;
pub(crate) mod windows;

pub use dispatch::dispatch;
pub use state::AppState;
pub use window::{enqueue_open, handle_window_event};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod window_tests;

pub async fn renderer_started(app: &tauri::AppHandle, label: &str) {
  use tauri::Manager;
  if let Some(root) = app.try_state::<std::sync::Arc<AppState>>() {
    let _handoff = root.windows.handoff.lock().await;
    let Ok(state) = root.for_window(label).await else {
      return;
    };
    state.windows.release_paths_for_reload(label).await;
    for id in state.windows.release_editors_for_reload(label).await {
      let _ = state.editor.close(&id).await;
    }
    state.document_exports.cancel_window(label);
    let _ = state.search.clear().await;
    state.mcp.stop(app).await;
  }
}
