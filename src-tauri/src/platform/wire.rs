//! Keep legacy method dispatch compatible while generated commands expose a named JSON type.
use crate::compute::wire::JsonValue;
use tauri::{AppHandle, WebviewWindow};

#[tauri::command]
#[specta::specta]
pub async fn native_request(
  app: AppHandle,
  window: WebviewWindow,
  method: String,
  args: JsonValue,
) -> Result<JsonValue, String> {
  super::request::native_request(app, window, method, args.0)
    .await
    .map(JsonValue)
}

#[cfg(feature = "e2e")]
#[tauri::command]
#[specta::specta]
pub async fn e2e_fixture(
  app: AppHandle,
  window: WebviewWindow,
  state: tauri::State<'_, std::sync::Arc<crate::runtime::AppState>>,
  action: String,
  args: JsonValue,
) -> Result<JsonValue, String> {
  super::fixtures::e2e_fixture(app, window, state, action, args.0)
    .await
    .map(JsonValue)
}
