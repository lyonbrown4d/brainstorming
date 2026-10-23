//! File-picker substitution in the separately identified native E2E build only.
//! Document storage, SQLCipher, resources and the actual webview remain real.
use crate::runtime::AppState;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, WebviewWindow};

pub async fn e2e_fixture(
  app: AppHandle,
  window: WebviewWindow,
  state: State<'_, Arc<AppState>>,
  action: String,
  args: Value,
) -> Result<Value, String> {
  if app.config().identifier != "app.brainstorming.e2e"
    || !state.windows.contains(window.label()).await
    || !super::request::trusted(&window, &app)
  {
    return Err("仅独立的本机测试应用允许使用测试文件选择器".into());
  }
  if action == "menuSnapshot" {
    return super::menu_snapshot::snapshot(&app).map_err(|error| error.to_string());
  }
  if action == "menu" {
    let id = args["id"].as_str().ok_or("缺少菜单操作")?;
    super::menu::dispatch(&app, id);
    return Ok(Value::Null);
  }
  #[cfg(target_os = "macos")]
  if action == "macChrome" {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    return app
      .native_bridge()
      .call("getWindowChromeMetrics", serde_json::json!({}))
      .await;
  }
  if action == "windowState" {
    let main = app.get_webview_window("main").ok_or("主窗口不存在")?;
    let snapshot = json!({"visible":main.is_visible().map_err(|e|e.to_string())?,
            "focused":main.is_focused().map_err(|e|e.to_string())?,
            "fullScreen":main.is_fullscreen().map_err(|e|e.to_string())?,
            "maximized":main.is_maximized().map_err(|e|e.to_string())?,
            "labels":app.webview_windows().keys().cloned().collect::<Vec<_>>()});
    #[cfg(target_os = "macos")]
    let snapshot = if args["diagnostics"].as_bool() == Some(true) {
      use tauri_plugin_brainstorming_native::NativeBridgeExt;
      let mut snapshot = snapshot;
      snapshot["macChrome"] = app
        .native_bridge()
        .call("getWindowChromeMetrics", json!({}))
        .await?;
      snapshot
    } else {
      snapshot
    };
    return Ok(snapshot);
  }
  if action == "dialogState" || action == "resetDialogs" {
    let mut choices = state.test_dialogs.lock().await;
    let kinds = choices
      .iter()
      .map(|(kind, _)| kind.clone())
      .collect::<Vec<_>>();
    if action == "resetDialogs" {
      choices.clear();
    }
    return Ok(json!({"kinds": kinds}));
  }
  let directory = state.directory.join("e2e-artifacts");
  tokio::fs::create_dir_all(&directory)
    .await
    .map_err(|e| e.to_string())?;
  let name = args["name"].as_str().unwrap_or("test.brainstorming");
  if name.is_empty() || name.len() > 160 || name.contains(['/', '\\']) || name.starts_with('.') {
    return Err("测试文件名称无效".into());
  }
  let path = directory.join(name);
  match action.as_str() {
    "dialog" => {
      let kind = args["kind"].as_str().ok_or("缺少对话框类型")?;
      if !["open", "save", "asset"].contains(&kind) {
        return Err("对话框类型无效".into());
      }
      let choice = if args["cancel"].as_bool().unwrap_or(false) {
        None
      } else {
        Some(path.clone())
      };
      state
        .test_dialogs
        .lock()
        .await
        .push_back((kind.into(), choice));
      Ok(json!({"path":path}))
    }
    "write" => {
      let content = args["base64"].as_str().ok_or("缺少测试内容")?;
      if content.len() > 8 * 1024 * 1024 {
        return Err("测试内容超过限制".into());
      }
      let bytes = STANDARD.decode(content).map_err(|e| e.to_string())?;
      tokio::fs::write(&path, bytes)
        .await
        .map_err(|e| e.to_string())?;
      Ok(json!({"path":path}))
    }
    "readDocument" => state
      .documents
      .read(path, args["password"].as_str())
      .await
      .map_err(|e| e.to_string()),
    "inspect" => {
      let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
      Ok(json!({"length":bytes.len(),"sqlite":bytes.starts_with(b"SQLite format 3\0")}))
    }
    _ => Err("测试操作无效".into()),
  }
}
