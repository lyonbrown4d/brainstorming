use crate::{
    media::MediaState,
    runtime::{self, AppState},
};
use serde_json::{Value, json};
use std::sync::Arc;
use tauri::{AppHandle, Manager, WebviewWindow};

pub(super) fn trusted(window: &WebviewWindow, app: &AppHandle) -> bool {
    let Ok(url) = window.url() else {
        return false;
    };
    trusted_url(&url, app)
}
pub(super) fn trusted_url(url: &url::Url, app: &AppHandle) -> bool {
    if cfg!(debug_assertions)
        && let Some(dev) = app.config().build.dev_url.as_ref()
        && url.origin() == dev.origin()
    {
        return true;
    }
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
}
#[tauri::command]
pub async fn native_request(
    app: AppHandle,
    window: WebviewWindow,
    method: String,
    args: Value,
) -> Result<Value, String> {
    if !trusted(&window, &app) {
        return Err("此页面无权访问本机数据".into());
    }
    if window.label() == "splash" {
        return match method.as_str() {
            "splashMounted" => Ok(
                json!({"language":app.try_state::<Arc<AppState>>().and_then(|s|s.language.read().ok().map(|v|v.clone())).unwrap_or_else(||"en".into()),"phase":super::initialization::phase(&app)}),
            ),
            "splashRetry" => {
                if let Some(main) = app.get_webview_window("main") {
                    main.reload().map_err(|_| "无法重新加载应用")?;
                }
                super::initialization::set_phase(&app, "loading");
                Ok(Value::Null)
            }
            "splashQuit" => {
                app.exit(0);
                Ok(Value::Null)
            }
            _ => Err("启动窗口无权访问编辑器数据".into()),
        };
    }
    if window.label() != "main" {
        return Err("此窗口无权访问编辑器数据".into());
    }
    let state = super::initialization::ready(&app).await?;
    let media = app.state::<Arc<MediaState>>();
    if let Some(result) = media.dispatch(&method, args.clone()).await {
        return result;
    }
    let result = runtime::dispatch(&app, &state, &method, args).await;
    if method == "setLanguage" && result.is_ok() {
        let _ = super::menu::install(&app);
    }
    if method == "startupFailed" {
        super::initialization::set_phase(&app, "failed");
    }
    result
}
