use super::{input::Result, state::AppState};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

pub fn state(app: &AppHandle) -> Result<Value> {
    let window = app.get_webview_window("main").ok_or("应用窗口不可用")?;
    Ok(
        json!({"focused":window.is_focused().unwrap_or(false),"fullScreen":window.is_fullscreen().unwrap_or(false)}),
    )
}
pub async fn appearance(app: &AppHandle, theme: &str) -> Result<()> {
    let theme = appearance_theme(theme)?;
    #[cfg(desktop)]
    {
        app.get_webview_window("main")
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
pub fn command(app: &AppHandle, method: &str) -> Result<Value> {
    let window = app.get_webview_window("main").ok_or("应用窗口不可用")?;
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
    if window.label() != "main" {
        return;
    }
    match event {
        WindowEvent::ThemeChanged(_) => {
            let _ = window.emit("native:system-theme", ());
        }
        WindowEvent::Focused(_) | WindowEvent::Resized(_) => {
            let _ = window.emit("native:window-state", json!({"focused":window.is_focused().unwrap_or(false),"fullScreen":window.is_fullscreen().unwrap_or(false)}));
        }
        WindowEvent::CloseRequested { api, .. } => {
            let app = window.app_handle().clone();
            let Some(state) = app.try_state::<std::sync::Arc<AppState>>() else {
                return;
            };
            if state
                .session
                .try_lock()
                .is_ok_and(|session| session.close_allowed)
            {
                return;
            }
            api.prevent_close();
            tauri::async_runtime::spawn(async move {
                close(&app).await;
            });
        }
        WindowEvent::Destroyed => {
            let app = window.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app.try_state::<std::sync::Arc<AppState>>() {
                    state.mcp.stop(&app).await;
                    state.ai.cancel_all().await;
                    let retained = {
                        let mut session = state.session.lock().await;
                        let retained = session.retained.drain().collect::<Vec<_>>();
                        session.passwords.clear();
                        session.pending.clear();
                        session.sources.clear();
                        session.authorized.clear();
                        retained
                    };
                    for path in retained {
                        let _ = state.documents.release(path).await;
                    }
                }
            });
        }
        _ => (),
    }
}
async fn close(app: &AppHandle) {
    let state = app.state::<std::sync::Arc<AppState>>();
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
        // Await any in-flight recovery commit before destroying the editor.
        {
            let _guard = state.recovery.lock().await;
        }
        state.mcp.stop(app).await;
        state.ai.cancel_all().await;
        crate::platform::finish_shutdown(app).await?;
        Ok::<bool, String>(true)
    }
    .await;
    let mut session = state.session.lock().await;
    session.closing = false;
    match result {
        Ok(true) => {
            session.close_allowed = true;
            drop(session);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.close();
            }
        }
        Ok(false) => (),
        Err(_) => {
            drop(session);
            use tauri_plugin_dialog::DialogExt;
            app.dialog()
                .message("自动恢复文件清理失败，请重试。所有打开的导图仍保留在窗口中。")
                .title("无法关闭")
                .show(|_| {});
        }
    }
}
pub async fn enqueue_open(app: &AppHandle, path: std::path::PathBuf) -> bool {
    if super::input::path(&path.to_string_lossy(), false).is_err() {
        return false;
    }
    let state = app.state::<std::sync::Arc<AppState>>();
    let accepted = state.session.lock().await.enqueue(path);
    if accepted {
        let _ = app.emit_to("main", "native:open-file", ());
        if let Some(window) = app.get_webview_window("main") {
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
