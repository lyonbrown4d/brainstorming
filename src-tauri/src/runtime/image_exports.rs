use super::{AppState, dialogs, input, native_files};
use crate::export_image::{Progress, Reporter, Request, Result, Stage};
use serde_json::{Value, json};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

pub async fn export(app: &AppHandle, state: &AppState, mut args: Value) -> Result<Value> {
  let request: Request = serde_json::from_value(
    args
      .get_mut("request")
      .map(Value::take)
      .ok_or("缺少图片导出请求")?,
  )
  .map_err(|_| "图片导出请求无效")?;
  request.validate()?;
  let lease = state.image_exports.enter(request.job_id).await?;
  let format = request.format.extension();
  let suggested_name = input::safe_name(&request.suggested_name);
  let cancellation = state.image_exports.cancellation();
  #[cfg(not(target_os = "ios"))]
  let path = tokio::select! {
      biased;
      _ = cancellation.cancelled() => return Ok(Value::Null),
      destination = dialogs::save(app, &suggested_name, format) => {
          let Some(path) = destination? else { return Ok(Value::Null); };
          path
      }
  };
  let job_id = request.job_id;
  let handle = app.clone();
  let label = state.window_id.clone();
  let report: Reporter = Arc::new(move |stage| {
    if let Some(window) = handle.get_webview_window(&label) {
      let _ = window.emit("native:export-progress", Progress { job_id, stage });
    }
  });
  let (bytes, lease) = state
    .image_exports
    .render(request, lease, report.clone())
    .await?;
  let exports = state.image_exports.clone();
  let notifications = state.notifications.clone();
  let metadata = state.metadata.clone();
  let english = state
    .language
    .read()
    .map(|language| *language == "en")
    .unwrap_or(false);
  let app = app.clone();
  // Own the lease through atomic I/O and mobile commit even if IPC's caller
  // disappears. Shutdown must wait for a detached blocking write to finish.
  tokio::spawn(async move {
    let _lease = lease;
    exports.ensure_open()?;
    report(Stage::Writing);
    #[cfg(not(target_os = "ios"))]
    let result = {
      super::atomic::write(&path, &bytes).await?;
      native_files::commit(&app, &path).await?;
      json!(path)
    };
    // iOS's official share sheet requires a complete file. Preserve its safe
    // staging flow, which cannot choose a destination before rendering.
    #[cfg(target_os = "ios")]
    let result = super::ios_save::export(&app, &bytes, &suggested_name, format).await?;
    if result.is_string() {
      report(Stage::Done);
    }
    notifications
      .finish_export(&metadata, english, Ok(result))
      .await
  })
  .await
  .map_err(|_| "图片导出写入任务失败")?
}
