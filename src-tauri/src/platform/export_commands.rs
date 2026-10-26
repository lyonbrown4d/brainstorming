use super::export_pipeline::{export_job, report};
use crate::{
  compute::wire::JsonValue,
  document_exports::{ExportContent, ExportFormat, ExportStage, Request, scope},
  runtime::AppState,
};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

async fn access(app: &AppHandle, window: &WebviewWindow) -> Result<Arc<AppState>, String> {
  if window.label() == "splash" || !super::request::trusted(window, app) {
    return Err("此窗口无权导出文档".into());
  }
  super::initialization::ready(app)
    .await?
    .for_window(window.label())
    .await
}
fn decode(input: Value) -> Result<Request, String> {
  let request: Request = serde_json::from_value(input).map_err(|_| "导出选项无效")?;
  if request.content == ExportContent::Presentation && !request.format.supports_presentation() {
    return Err("此格式不支持演示页面".into());
  }
  if request.view.is_some() && !request.format.supports_view() {
    return Err("当前视角仅支持图片和 PDF".into());
  }
  if (request.content == ExportContent::View) != request.view.is_some() {
    return Err("请重新截取当前视角后导出".into());
  }
  if request.format == ExportFormat::Pptx && request.content != ExportContent::Presentation {
    return Err("PowerPoint 导出需要选择演示页面".into());
  }
  if serde_json::to_vec(&request)
    .map_err(|_| "导出内容无效")?
    .len()
    > 64 * 1024 * 1024
  {
    return Err("导出内容超过 64 MiB 限制，请分批导出".into());
  }
  if request.geometry.len() > 128
    || request.width.is_some_and(|v| v == 0 || v > 16384)
    || request.height.is_some_and(|v| v == 0 || v > 16384)
    || request
      .scale
      .is_some_and(|v| !v.is_finite() || v <= 0.0 || v > 8.0)
    || request.jpeg_quality.is_some_and(|v| v == 0 || v > 100)
    || (request.jpeg_quality.is_some() && request.format != ExportFormat::Jpg)
  {
    return Err("导出尺寸或质量无效".into());
  }
  Ok(request)
}
#[tauri3_specta::command]
pub async fn document_export_prepare(
  app: AppHandle,
  window: WebviewWindow,
  input: JsonValue,
) -> Result<JsonValue, String> {
  let state = access(&app, &window).await?;
  let _admission = super::initialization::acquire(&app).await?;
  let request = decode(input.0)?;
  state
    .compute
    .run(move || scope::select(&request))
    .await
    .map(JsonValue)
}
#[tauri3_specta::command]
pub async fn document_export_presentation(
  app: AppHandle,
  window: WebviewWindow,
  input: JsonValue,
) -> Result<JsonValue, String> {
  let state = access(&app, &window).await?;
  let _admission = super::initialization::acquire(&app).await?;
  let request = decode(input.0)?;
  let workbook = state.compute.run(move || scope::select(&request)).await?;
  let workbook = crate::runtime::compute::hydrate_for(&app, &state, workbook, false).await?;
  state
    .compute
    .run(move || json_pages(&workbook))
    .await
    .map(JsonValue)
}
fn json_pages(workbook: &Value) -> Result<Value, String> {
  serde_json::to_value(crate::document_exports::presentation::pages(workbook)?)
    .map_err(|_| "演示预览生成失败".into())
}
#[tauri3_specta::command]
pub async fn document_export_start(
  app: AppHandle,
  window: WebviewWindow,
  input: JsonValue,
) -> Result<Option<String>, String> {
  let state = access(&app, &window).await?;
  let admission = super::initialization::acquire(&app).await?;
  let request = decode(input.0)?;
  let id = request.job_id;
  report(&app, window.label(), id, ExportStage::Queued, 0, 1);
  // The spawned owner retains admission and the export lease through native writes,
  // even when IPC is dropped because its originating WebView disappears.
  tokio::spawn(async move {
    let _admission = admission;
    let job = state.document_exports.enter(&state.window_id, id).await?;
    export_job(&app, state, request, job).await
  })
  .await
  .map_err(|_| "导出任务失败")?
}
#[tauri3_specta::command]
pub async fn document_export_cancel(
  app: AppHandle,
  window: WebviewWindow,
  job_id: String,
) -> Result<bool, String> {
  let state = access(&app, &window).await?;
  Ok(state.document_exports.cancel(
    &state.window_id,
    job_id.parse().map_err(|_| "导出任务无效")?,
  ))
}
#[tauri3_specta::command]
pub async fn document_export_reveal(
  app: AppHandle,
  window: WebviewWindow,
  path: String,
  reveal: bool,
) -> Result<(), String> {
  let state = access(&app, &window).await?;
  if !state.document_exports.has_export(&state.window_id, &path) {
    return Err("此窗口没有对应导出文件的访问授权".into());
  }
  tokio::task::spawn_blocking(move || {
    if reveal {
      app.opener().reveal_item_in_dir(path)
    } else {
      app.opener().open_path(path, None::<String>)
    }
    .map_err(|_| "无法打开导出文件".to_string())
  })
  .await
  .map_err(|_| "打开文件任务失败")?
}

#[tauri3_specta::command]
pub async fn document_export_preview(
  app: AppHandle,
  window: WebviewWindow,
  input: JsonValue,
) -> Result<JsonValue, String> {
  let state = access(&app, &window).await?;
  let _admission = super::initialization::acquire(&app).await?;
  let mut request = decode(input.0)?;
  let job = state
    .document_exports
    .enter(&state.window_id, request.job_id)
    .await?;
  request.workbook = state
    .compute
    .run({
      let request = request.clone();
      move || scope::select(&request)
    })
    .await?;
  job.check()?;
  let first = request.sheet_ids.first().ok_or("请选择导出画布")?.clone();
  request.workbook = crate::interchange::select_sheets(&request.workbook, Some(&first))?;
  request.sheet_ids = vec![first];
  request.workbook =
    crate::runtime::compute::hydrate_for(&app, &state, request.workbook, false).await?;
  let pages = super::export_pipeline::prepare_pages(&state, &request, &job, &app).await?;
  let mut page = pages.into_iter().next().ok_or("导出预览为空")?;
  if request.transparent && request.content == ExportContent::Map {
    super::export_pipeline::remove_background(&mut page)?;
  }
  serde_json::to_value(page)
    .map(JsonValue)
    .map_err(|_| "导出预览无效".into())
}
