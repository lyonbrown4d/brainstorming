use super::{input::Result, state::AppState};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

pub fn startup_ready(app: &AppHandle, label: &str) -> Result<()> {
  let Some(main) = app.get_webview_window(label) else {
    return Ok(());
  };
  crate::platform::restore_window_state(&main);
  // Match Tauri's splash handoff: queue its close before revealing main.
  // Showing main first lets closing the key splash deactivate the application.
  if label == "main"
    && let Some(splash) = app.get_webview_window("splash")
  {
    // Resign the splash's native key-window status before its deferred close.
    splash.hide().map_err(|_| "无法隐藏启动窗口")?;
    splash.close().map_err(|_| "无法关闭启动窗口")?;
  }
  main.show().map_err(|_| "无法显示主窗口")?;
  #[cfg(target_os = "macos")]
  app.show().map_err(|_| "无法显示应用")?;
  main.set_focus().map_err(|_| "无法聚焦窗口")?;
  Ok(())
}

pub fn state(app: &AppHandle, label: &str) -> Result<Value> {
  let window = app.get_webview_window(label).ok_or("应用窗口不可用")?;
  Ok(
    json!({"focused":window.is_focused().unwrap_or(false),"fullScreen":window.is_fullscreen().unwrap_or(false)}),
  )
}
pub async fn appearance(app: &AppHandle, label: &str, theme: &str) -> Result<()> {
  let theme = appearance_theme(theme)?;
  #[cfg(desktop)]
  {
    app
      .get_webview_window(label)
      .ok_or("应用窗口不可用")?
      .set_theme(theme)
      .map_err(|_| "无法设置应用外观".into())
  }
  #[cfg(mobile)]
  {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    app.native_bridge()
            .call(
                "setAppearance",
                json!({"theme":match theme { Some(tauri::Theme::Dark) => "dark", Some(tauri::Theme::Light) => "light", None => "system", _ => return Err("应用外观无效".into()) }}),
            )
            .await
            .map(|_| ())
            .map_err(|_| "无法设置应用外观".into())
  }
}
pub fn command(app: &AppHandle, label: &str, method: &str) -> Result<Value> {
  let window = app.get_webview_window(label).ok_or("应用窗口不可用")?;
  let result = match method {
    "minimizeWindow" => window.minimize(),
    "maximizeWindow" => {
      if window.is_maximized().unwrap_or(false) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
    "closeWindow" => window.close(),
    "startWindowDrag" => window.start_dragging(),
    "toggleFullScreen" => window.set_fullscreen(!window.is_fullscreen().unwrap_or(false)),
    _ => return Err("窗口操作无效".into()),
  };
  result.map_err(|_| "窗口操作失败")?;
  Ok(Value::Null)
}
pub fn handle_window_event(window: &Window, event: &WindowEvent) {
  if window.label() != "main" && !window.label().starts_with("editor-") {
    return;
  }
  match event {
    WindowEvent::ThemeChanged(_) => {
      let _ = window.emit("native:system-theme", ());
    }
    WindowEvent::Focused(_) | WindowEvent::Resized(_) => {
      if matches!(event, WindowEvent::Focused(true)) {
        let _ = crate::platform::install_menu(window.app_handle());
      }
      let _ = window.emit("native:window-state", json!({"focused":window.is_focused().unwrap_or(false),"fullScreen":window.is_fullscreen().unwrap_or(false)}));
    }
    WindowEvent::CloseRequested { api, .. } => {
      let app = window.app_handle().clone();
      let Some(state) = app.try_state::<std::sync::Arc<AppState>>() else {
        return;
      };
      if state
        .windows
        .try_close_allowed(window.label())
        .unwrap_or(false)
      {
        return;
      }
      api.prevent_close();
      let label = window.label().to_string();
      tauri::async_runtime::spawn(async move {
        super::window_lifecycle::close(&app, &label).await;
      });
    }
    _ => (),
  }
}
pub async fn enqueue_open(app: &AppHandle, path: std::path::PathBuf) -> bool {
  if super::input::path(&path.to_string_lossy(), false).is_err() {
    return false;
  }
  let state = app.state::<std::sync::Arc<AppState>>();
  let canonical = tokio::fs::canonicalize(&path).await.unwrap_or(path.clone());
  if super::window_transfer::focus_owner(app, &state, &canonical).await {
    return true;
  }
  let label = focused_label(app).unwrap_or_else(|| "main".into());
  let Ok(state) = state.for_window(&label).await else {
    return false;
  };
  let accepted = state.session.lock().await.enqueue(path);
  if accepted {
    let _ = app.emit_to(&label, "native:open-file", ());
    if let Some(window) = app.get_webview_window(&label)
      && window.is_visible().unwrap_or(false)
    {
      let _ = window.unminimize();
      let _ = window.set_focus();
    }
  }
  accepted
}

fn appearance_theme(value: &str) -> Result<Option<tauri::Theme>> {
  match value {
    "light" => Ok(Some(tauri::Theme::Light)),
    "dark" => Ok(Some(tauri::Theme::Dark)),
    "system" => Ok(None),
    _ => Err("应用外观无效".into()),
  }
}

pub fn focused_label(app: &AppHandle) -> Option<String> {
  let windows = app.webview_windows();
  windows
    .values()
    .find(|window| {
      (window.label() == "main" || window.label().starts_with("editor-"))
        && window.is_focused().unwrap_or(false)
    })
    .or_else(|| {
      windows
        .values()
        .find(|window| window.label() == "main" || window.label().starts_with("editor-"))
    })
    .map(|window| window.label().to_string())
}

#[cfg(test)]
mod tests {
  use super::appearance_theme;
  #[test]
  fn native_system_appearance_clears_override_and_manual_modes_stay_explicit() {
    assert_eq!(appearance_theme("system").unwrap(), None);
    assert_eq!(
      appearance_theme("light").unwrap(),
      Some(tauri::Theme::Light)
    );
    assert_eq!(appearance_theme("dark").unwrap(), Some(tauri::Theme::Dark));
    assert!(appearance_theme("auto").is_err());
  }
}
