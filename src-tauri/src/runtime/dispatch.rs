use super::{
  clipboard, content_search, dialogs, documents,
  input::{self, Result},
  native_files, recovery,
  state::AppState,
  window,
};
use serde_json::{Value, json};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

pub async fn dispatch(
  app: &AppHandle,
  state: &AppState,
  method: &str,
  args: Value,
) -> Result<Value> {
  match method {
        "initialize" => Ok(json!({"platform":platform(),"resourceOrigin":state.resource_origin.read().map_err(|_| "资源服务不可用")?.clone(),"language":state.language.read().map_err(|_| "语言设置不可用")?.clone(),"windowState":window::state(app, &state.window_id)?})),
        "syncMenuState" => { crate::platform::sync_menu(app, &state.window_id, args)?; Ok(Value::Null) }
        "newWindow" => Ok(json!(super::window_transfer::create(app, state).await?)),
        "listWindows" => Ok(super::window_transfer::list(app, state).await),
        "moveDocumentToWindow" => super::window_transfer::move_document(app, state, &args).await,
        "takeTransferredDocument" => super::window_transfer::receive(state).await,
        "acknowledgeDocumentTransfer" => { super::window_transfer::acknowledge(state, input::text(&args, "token", 80)?).await?; Ok(Value::Null) }
        "openDocumentInNewWindow" => {
            if let Some(path) = dialogs::open(app).await? {
                let canonical = tokio::fs::canonicalize(&path).await.map_err(|_| "文件不可用")?;
                if !super::window_transfer::focus_owner(app, state, &canonical).await {
                    let label = super::window_transfer::create(app, state).await?;
                    state.for_window(&label).await?.session.lock().await.enqueue(path);
                }
            }
            Ok(Value::Null)
        }
        "listBuiltinArt" => Ok(json!(crate::builtin_art::list()?)),
        "getBuiltinArt" => Ok(json!(&*crate::builtin_art::get(input::text(&args, "id", 80)?).await?)),
        "listTemplates" => Ok(json!(crate::templates::list()?)),
        "getTemplate" => Ok(json!(crate::templates::get(input::text(&args, "id", 80)?)?)),
        "getLanguage" => Ok(json!(state.language.read().map_err(|_| "语言设置不可用")?.clone())),
        "setLanguage" => {
            let language = input::text(&args, "language", 10)?;
            if !["zh-CN", "en"].contains(&language) { return Err("不支持的界面语言".into()); }
            state.metadata.set_language(language).await.map_err(|e| e.to_string())?;
            *state.language.write().map_err(|_| "语言设置不可用")? = language.into();
            Ok(json!(language))
        }
        "exportImage" => super::image_exports::export(app, state, args).await,
        "getNotificationSettings" => Ok(json!(state.notifications.settings(&state.metadata).await?)),
        "setNotificationsEnabled" => {
            let input: super::notifications::SetEnabled = serde_json::from_value(args).map_err(|_| "通知设置无效")?;
            Ok(json!(state.notifications.set_enabled(&state.metadata, input.enabled).await?))
        }
        "getWindowState" => window::state(app, &state.window_id),
        "setAppearance" => { window::appearance(app, &state.window_id, input::text(&args, "theme", 10)?).await?; Ok(Value::Null) }
        "minimizeWindow" | "maximizeWindow" | "closeWindow" | "startWindowDrag" | "toggleFullScreen" => window::command(app, &state.window_id, method),
        "hasOpenFile" => Ok(json!(!state.session.lock().await.open_files.is_empty())),
        "takeOpenFile" => {
            let path = state.session.lock().await.open_files.pop_front();
            match path { Some(path) => open_document(app, state, path).await, None => Ok(Value::Null) }
        }
        "openDocument" => match dialogs::open(app).await? { Some(path) => open_document(app, state, path).await, None => Ok(Value::Null) },
        "openRecent" => {
            let path = input::text(&args, "path", 4096)?;
            if !state.metadata.recent_files().await.map_err(|e| e.to_string())?.iter().any(|p| p == path) { return Err("文件不在最近文件列表中".into()); }
            open_document(app, state, PathBuf::from(path)).await
        }
        "getRecentFiles" => Ok(json!(state.metadata.recent_files().await.map_err(|e| e.to_string())?.iter().map(|p| json!({"path":p,"name":std::path::Path::new(p).file_name().unwrap_or_default().to_string_lossy()})).collect::<Vec<_>>())),
        "getDocumentPreviewRevision" => super::document_previews::revision(state, &args).await,
        "writeDocumentPreviews" => super::document_previews::write(state, &args).await,
        "saveDocument" => {
            let request = input::required(&args, "request")?;
            #[cfg(target_os = "ios")]
            if request["path"].is_null() { return super::ios_save::save_new(app, state, request).await; }
            let path = if let Some(path) = request["path"].as_str() { input::path(path, true)? }
                else {
                    let Some(path) = dialogs::save(app, input::text(request, "suggestedName", 4096)?, "brainstorming").await? else { return Ok(Value::Null); };
                    state.session.lock().await.authorized.insert(path.clone());
                    path
                };
            let result = documents::save(state, path.clone(), request).await?;
            native_files::commit(app, &path).await?;
            Ok(result)
        }
        "releaseDocument" => {
            let path = input::path(input::text(&args, "path", 4096)?, true)?;
            let mut session = state.session.lock().await;
            if session.retained.remove(&path) {
                state.windows.release_path(&state.window_id, &path).await;
                state.documents.release(&path).await.map_err(|e| e.to_string())?;
                let ids: Vec<String> = session.sources.iter().filter(|(_, p)| **p == path).map(|(id, _)| id.clone()).collect();
                for id in ids { session.sources.remove(&id); session.passwords.remove(&id); }
            }
            Ok(Value::Null)
        }
        "unlockDocument" => documents::unlock(state, input::text(&args, "token", 80)?, input::text(&args, "password", 4096)?).await,
        "activateUnlockedDocument" => documents::activate(state, input::text(&args, "token", 80)?).await,
        "cancelUnlock" => { state.session.lock().await.pending.remove(input::text(&args, "token", 80)?); Ok(Value::Null) }
        "getFileSecurity" => {
            let id = input::text(&args, "documentId", 4096)?; input::identifier(id)?;
            Ok(json!({"encrypted":state.session.lock().await.password_for(id).is_some()}))
        }
        "setFilePassword" => {
            let password = input::required(&args, "password")?;
            let password = if password.is_null() { None } else { Some(password.as_str().ok_or("密码格式无效")?) };
            let id = input::text(&args, "documentId", 4096)?;
            let result = documents::set_password(state, id, password).await?;
            let path = state.session.lock().await.sources.get(id).cloned();
            if let Some(path) = path { native_files::commit(app, &path).await?; }
            Ok(result)
        }
        "readWorkspaceRecovery" => recovery::read(state).await,
        "writeWorkspaceRecovery" => { recovery::write(state, input::required(&args, "contents")?).await?; Ok(Value::Null) }
        "readLockedRecovery" | "readRecovery" => {
            let all = recovery::read(state).await?;
            let first = all.as_array().and_then(|items| items.first()).cloned().unwrap_or(Value::Null);
            if let Some(items) = all.as_array() {
                let mut session = state.session.lock().await;
                for item in items.iter().skip(1) { if let Some(token) = item["lockedToken"].as_str() { session.pending.remove(token); } }
            }
            if method == "readRecovery" {
                if let Some(token) = first["lockedToken"].as_str() { state.session.lock().await.pending.remove(token); return Err("自动恢复文件无法读取，请输入密码".into()); }
                Ok(first.get("contents").cloned().unwrap_or(Value::Null))
            } else { Ok(first) }
        }
        "writeRecovery" => { recovery::write(state, &json!([input::text(&args, "contents", input::MAX_DOCUMENT)?])).await?; Ok(Value::Null) }
        "listDocumentBackups" => recovery::backups(state, input::text(&args, "documentId", 4096)?).await,
        "restoreDocumentBackup" => recovery::restore(state, input::text(&args, "id", 200)?).await,
        "setDirty" => {
            let dirty = args["dirty"].as_bool().ok_or("文档状态无效")?;
            let mut session = state.session.lock().await;
            session.dirty = dirty; session.preserve_recovery = args["preserveRecovery"].as_bool().unwrap_or(false);
            if let Some(window) = app.get_webview_window(&state.window_id) {
                let title = args["documentTitle"].as_str().unwrap_or("").chars().take(200).collect::<String>();
                let title = if title.is_empty() { "Brainstorming".into() } else { format!("{title} — Brainstorming") };
                let _ = window.set_title(&format!("{}{title}", if dirty { "● " } else { "" }));
            }
            Ok(Value::Null)
        }
        "syncContentIndex" => content_search::sync(state, &args).await,
        "searchContent" => content_search::search(state, &args).await,
        "getAISettings" => state.ai.get(app).await,
        "saveAISettings" => state.ai.save(app, input::required(&args, "settings")?).await,
        "generateMindMap" => state.ai.generate(app, input::required(&args, "request")?).await,
        "cancelAIGeneration" => { state.ai.cancel(input::text(&args, "requestId", 80)?).await; Ok(Value::Null) }
        "getMCPConnection" => Ok(state.mcp.connection().await),
        "startMCPServer" => state.mcp.start(app, input::required(&args, "input")?).await,
        "stopMCPServer" => { state.mcp.stop(app).await; Ok(Value::Null) }
        "replyMCPRequest" => { state.mcp.reply(input::required(&args, "reply")?).await?; Ok(Value::Null) }
        "writeTopicClipboard" => { clipboard::write(app, &args).await?; Ok(Value::Null) }
        "readTopicClipboard" => Ok(json!(clipboard::read(app).await?)),
        "exportFile" => {
            let result = export(app, input::required(&args, "request")?).await;
            let english = state.language.read().map(|value| value.as_str() == "en").unwrap_or(false);
            state.notifications.finish_export(&state.metadata, english, result).await
        }
        "openExternal" => {
            let url = input::external_url(input::text(&args, "url", 4096)?)?;
            let handle = app.clone();
            tokio::task::spawn_blocking(move || handle.opener().open_url(url, None::<String>))
                .await.map_err(|_| "外部链接任务失败")?
                .map_err(|_| "无法打开外部链接")?;
            Ok(Value::Null)
        }
        "startupReady" => {
            window::startup_ready(app, &state.window_id)?;
            Ok(Value::Null)
        }
        "startupFailed" => { if state.window_id == "main" && let Some(splash) = app.get_webview_window("splash") { let _ = splash.show(); } else if let Some(window) = app.get_webview_window(&state.window_id) { let _ = window.show(); } Ok(Value::Null) }
        _ => Err(format!("未知原生方法：{method}")),
    }
}
async fn export(app: &AppHandle, request: &Value) -> Result<Value> {
  let format = input::text(request, "format", 10)?;
  if !["png", "svg", "pdf", "xmind", "md", "opml", "txt"].contains(&format) {
    return Err("导出格式无效".into());
  }
  let bytes = input::bytes(input::required(request, "bytes")?, input::MAX_DOCUMENT)?;
  #[cfg(target_os = "ios")]
  return super::ios_save::export(
    app,
    &bytes,
    input::text(request, "suggestedName", 4096)?,
    format,
  )
  .await;
  let Some(path) = dialogs::save(app, input::text(request, "suggestedName", 4096)?, format).await?
  else {
    return Ok(Value::Null);
  };
  super::atomic::write(&path, &bytes).await?;
  native_files::commit(app, &path).await?;
  Ok(json!(path))
}
fn platform() -> &'static str {
  if cfg!(target_os = "macos") {
    "macos"
  } else if cfg!(target_os = "windows") {
    "windows"
  } else if cfg!(target_os = "ios") {
    "ios"
  } else if cfg!(target_os = "android") {
    "android"
  } else {
    "linux"
  }
}

async fn open_document(app: &AppHandle, state: &AppState, path: PathBuf) -> Result<Value> {
  let canonical = tokio::fs::canonicalize(&path)
    .await
    .map_err(|_| "无法打开文档文件")?;
  if super::window_transfer::focus_owner(app, state, &canonical).await {
    return Ok(Value::Null);
  }
  documents::open(state, canonical).await
}
