use tauri::{AppHandle, Manager, WebviewWindow};

#[tauri::command]
#[specta::specta]
pub async fn focus_editor_window(
  app: AppHandle,
  window: WebviewWindow,
  window_id: String,
) -> Result<(), String> {
  if !super::request::trusted(&window, &app) || window.label() == "splash" {
    return Err("此窗口无权切换编辑窗口".into());
  }
  let state = super::initialization::ready(&app).await?;
  let _lease = super::initialization::acquire(&app).await?;
  if !state.windows.contains(window.label()).await || !state.windows.contains(&window_id).await {
    return Err("编辑窗口已关闭".into());
  }
  let target = app.get_webview_window(&window_id).ok_or("编辑窗口已关闭")?;
  target.unminimize().map_err(|_| "无法恢复窗口")?;
  target.show().map_err(|_| "无法显示窗口")?;
  target.set_focus().map_err(|_| "无法聚焦窗口".into())
}
