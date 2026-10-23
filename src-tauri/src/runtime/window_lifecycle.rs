use super::AppState;
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub async fn close(app: &AppHandle, label: &str) {
  let root = app.state::<Arc<AppState>>();
  let _handoff = root.windows.handoff.lock().await;
  let Ok(state) = root.for_window(label).await else {
    return;
  };
  state.windows.cancel_window_transfers(label).await;
  let (dirty, preserve) = {
    let mut session = state.session.lock().await;
    if session.closing {
      return;
    }
    session.closing = true;
    (session.dirty, session.preserve_recovery)
  };
  let result = async {
    if dirty && !super::dialogs::confirm_discard(app).await? {
      return Ok(false);
    }
    if dirty && !preserve {
      super::recovery::write(&state, &json!([])).await?;
    }
    {
      let _guard = state.recovery.lock().await;
    }
    if let Some(window) = app.get_webview_window(label) {
      crate::platform::save_window_state(&window).await;
    }
    Ok::<bool, String>(true)
  }
  .await;
  let mut session = state.session.lock().await;
  session.closing = false;
  if matches!(result, Ok(true)) {
    session.close_allowed = true;
    drop(session);
    if let Some(window) = app.get_webview_window(label) {
      let _ = window.close();
    }
  } else if result.is_err() {
    use tauri_plugin_dialog::DialogExt;
    app
      .dialog()
      .message("自动恢复文件清理失败，请重试。所有打开的导图仍保留在窗口中。")
      .title("无法关闭")
      .show(|_| {});
  }
}
pub async fn destroyed(app: &AppHandle, label: &str) {
  let Some(root) = app.try_state::<Arc<AppState>>() else {
    return;
  };
  let _handoff = root.windows.handoff.lock().await;
  root.document_exports.cancel_window(label);
  for id in root.windows.release_editors(label).await {
    let _ = root.editor.close(&id).await;
  }
  if let Some(slot) = root.windows.remove(label).await {
    slot.mcp.shutdown().await;
    slot.search.shutdown().await;
    let paths = {
      let mut session = slot.session.lock().await;
      session.passwords.clear();
      session.pending.clear();
      session.sources.clear();
      session.retained.drain().collect::<Vec<_>>()
    };
    for path in paths {
      let _ = root.documents.release(path).await;
    }
  }
  if let Some(media) = app.try_state::<Arc<crate::media::MediaState>>() {
    media.remove_window(label).await;
  }
  let _ = crate::platform::install_menu(app);
  if root.windows.labels().await.is_empty() {
    crate::platform::exit(app, 0);
  }
}
pub async fn quit(app: &AppHandle, code: i32) {
  let Some(root) = app.try_state::<Arc<AppState>>() else {
    crate::platform::exit(app, code);
    return;
  };
  use std::sync::atomic::Ordering;
  if root.windows.quitting.swap(true, Ordering::AcqRel) {
    return;
  }
  let _handoff = root.windows.handoff.lock().await;
  let labels = root.windows.labels().await;
  let mut dirty = false;
  for label in &labels {
    if let Ok(slot) = root.windows.get(label).await {
      dirty |= slot.session.lock().await.dirty;
    }
  }
  if dirty && !super::dialogs::confirm_discard(app).await.unwrap_or(false) {
    root.windows.quitting.store(false, Ordering::Release);
    return;
  }
  for label in &labels {
    root.windows.cancel_window_transfers(label).await;
  }
  // All windows confirm before shared service admission closes or any editor is destroyed.
  for label in &labels {
    let Ok(state) = root.for_window(label).await else {
      continue;
    };
    let preserve = state.session.lock().await.preserve_recovery;
    if !preserve && super::recovery::write(&state, &json!([])).await.is_err() {
      root.windows.quitting.store(false, Ordering::Release);
      return;
    }
    state.session.lock().await.close_allowed = true;
  }
  crate::platform::exit(app, code);
}
