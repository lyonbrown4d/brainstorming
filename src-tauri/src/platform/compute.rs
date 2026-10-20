use crate::compute::wire::{JsonValue, WireValue};
use crate::{
  compute::{FindInput, FindMatch, LayoutInput},
  editor_engine::EngineSnapshot,
  layout_engine::Layout,
  runtime::AppState,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, WebviewWindow};
use tokio::sync::OwnedRwLockReadGuard;

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EditorSnapshot {
  pub session_id: String,
  pub revision: String,
  #[specta(type = WireValue)]
  pub workbook: Value,
  pub can_undo: bool,
  pub can_redo: bool,
}
impl From<EngineSnapshot> for EditorSnapshot {
  fn from(value: EngineSnapshot) -> Self {
    Self {
      session_id: value.session_id,
      revision: value.revision.to_string(),
      workbook: value.workbook,
      can_undo: value.can_undo,
      can_redo: value.can_redo,
    }
  }
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SceneInput {
  #[specta(type = WireValue)]
  pub workbook: Value,
  pub sheet_id: String,
  #[serde(default)]
  pub include_collapsed: bool,
  pub geometry: Option<crate::scene::VisualGeometry>,
}
#[derive(Serialize, specta::Type)]
pub struct SheetScene {
  pub svg: String,
  pub width: f64,
  pub height: f64,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormatInput {
  #[specta(type = WireValue)]
  pub workbook: Value,
  pub format: String,
  pub sheet_id: Option<String>,
}
async fn access(
  app: &AppHandle,
  window: &WebviewWindow,
) -> Result<(Arc<AppState>, OwnedRwLockReadGuard<bool>), String> {
  if window.label() != "main" || !super::request::trusted(window, app) {
    return Err("此窗口无权访问文档计算".into());
  }
  let state = super::initialization::ready(app).await?;
  let lease = super::initialization::acquire(app).await?;
  Ok((state, lease))
}
#[tauri::command]
#[specta::specta]
pub async fn editor_open(
  app: AppHandle,
  window: WebviewWindow,
  session_id: String,
  workbook: JsonValue,
) -> Result<EditorSnapshot, String> {
  let (state, _lease) = access(&app, &window).await?;
  crate::runtime::input::identifier(&session_id)?;
  Ok(state.editor.open(session_id, workbook.0).await?.into())
}
#[tauri::command]
#[specta::specta]
pub async fn editor_execute(
  app: AppHandle,
  window: WebviewWindow,
  session_id: String,
  revision: String,
  operation: JsonValue,
) -> Result<EditorSnapshot, String> {
  let (state, _lease) = access(&app, &window).await?;
  let revision = revision.parse::<u64>().map_err(|_| "文档版本无效")?;
  Ok(
    state
      .editor
      .execute(&session_id, revision, operation.0)
      .await?
      .into(),
  )
}
#[tauri::command]
#[specta::specta]
pub async fn editor_close(
  app: AppHandle,
  window: WebviewWindow,
  session_id: String,
) -> Result<(), String> {
  let (state, _lease) = access(&app, &window).await?;
  state.editor.close(&session_id).await
}
#[tauri::command]
#[specta::specta]
pub async fn compute_layout(
  app: AppHandle,
  window: WebviewWindow,
  input: LayoutInput,
) -> Result<Layout, String> {
  let (state, _lease) = access(&app, &window).await?;
  state
    .compute
    .layout(input)
    .await
    .map(|layout| (*layout).clone())
}
#[tauri::command]
#[specta::specta]
pub async fn compute_find(
  app: AppHandle,
  window: WebviewWindow,
  input: FindInput,
) -> Result<Vec<FindMatch>, String> {
  let (state, _lease) = access(&app, &window).await?;
  state.search.find(input).await
}
#[tauri::command]
#[specta::specta]
pub async fn compute_render(
  app: AppHandle,
  window: WebviewWindow,
  input: SceneInput,
) -> Result<SheetScene, String> {
  let (state, _lease) = access(&app, &window).await?;
  let workbook = crate::runtime::compute::hydrate(&app, input.workbook, false).await?;
  crate::runtime::compute::render(&state, SceneInput { workbook, ..input }).await
}
#[tauri::command]
#[specta::specta]
pub async fn compute_export(
  app: AppHandle,
  window: WebviewWindow,
  input: FormatInput,
) -> Result<Option<String>, String> {
  let (state, _lease) = access(&app, &window).await?;
  crate::runtime::compute::export(&app, &state, input).await
}
#[tauri::command]
#[specta::specta]
pub async fn compute_import_text(
  app: AppHandle,
  window: WebviewWindow,
  format: String,
  text: String,
) -> Result<JsonValue, String> {
  let (state, _lease) = access(&app, &window).await?;
  state.compute.import_text(format, text).await.map(JsonValue)
}

#[tauri::command]
#[specta::specta]
pub async fn compute_previews(
  app: AppHandle,
  window: WebviewWindow,
  input: JsonValue,
) -> Result<(), String> {
  let (state, _lease) = access(&app, &window).await?;
  crate::runtime::compute_previews::refresh(&app, &state, input.0).await
}
