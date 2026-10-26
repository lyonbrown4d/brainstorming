use super::{AppState, input, windows::Transfer};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};

pub async fn create(app: &AppHandle, state: &AppState) -> Result<String, String> {
  #[cfg(desktop)]
  {
    let label = format!("editor-{}", uuid::Uuid::new_v4().simple());
    state
      .windows
      .register(
        &label,
        state
          .metadata
          .recent_files()
          .await
          .map_err(|e| e.to_string())?,
      )
      .await?;
    let mut config = app
      .config()
      .app
      .windows
      .first()
      .cloned()
      .ok_or("窗口配置不可用")?;
    config.label = label.clone();
    config.visible = false;
    config.title = "Brainstorming".into();
    let built =
      tauri::WebviewWindowBuilder::from_config(app, &config).and_then(|builder| builder.build());
    if built.is_err() {
      state.windows.remove(&label).await;
      return Err("无法创建窗口".into());
    }
    let _ = crate::platform::install_menu(app);
    Ok(label)
  }
  #[cfg(mobile)]
  {
    let _ = (app, state);
    Err("当前平台不支持多窗口".into())
  }
}
pub async fn list(app: &AppHandle, state: &AppState) -> Value {
  let mut windows = Vec::new();
  for label in state.windows.labels().await {
    if let Some(window) = app.get_webview_window(&label) {
      windows.push(json!({"id":label,"title":window.title().unwrap_or_else(|_| "Brainstorming".into()),"current":label==state.window_id}));
    }
  }
  json!(windows)
}
pub async fn move_document(
  app: &AppHandle,
  state: &AppState,
  args: &Value,
) -> Result<Value, String> {
  let _handoff = state.windows.handoff.lock().await;
  if state.session.lock().await.close_allowed {
    return Err("当前窗口正在关闭".into());
  }
  let payload = input::required(args, "session")?.clone();
  if payload.to_string().len() > input::MAX_DOCUMENT {
    return Err("导图会话超过大小限制".into());
  }
  let workbook = input::required(&payload["editor"], "workbook")?;
  crate::document::validate_workbook(workbook).map_err(|error| error.to_string())?;
  let id = input::workbook_id(workbook)?.to_string();
  // A never-edited tab has no native history yet; establishing it here preserves
  // the same authoritative session for all subsequent edits in the target.
  state.windows.claim_editor(&state.window_id, &id).await?;
  let snapshot = state.editor.open(id.clone(), workbook.clone()).await?;
  if snapshot.workbook != *workbook {
    return Err("请等待导图编辑完成后重试移交".into());
  }
  let target = match args["targetWindowId"].as_str() {
    Some(target) if target != state.window_id && state.windows.contains(target).await => {
      target.to_string()
    }
    Some(_) => return Err("目标窗口无效".into()),
    None => create(app, state).await?,
  };
  let target_state = state.for_window(&target).await?;
  if target_state.session.lock().await.close_allowed {
    return Err("目标窗口正在关闭".into());
  }
  let media = app.state::<std::sync::Arc<crate::media::MediaState>>();
  let source_media = media.for_window(std::sync::Arc::new(state.clone())).await?;
  let target_media = media.for_window(target_state.clone()).await?;
  source_media
    .transfer_document(&target_media, workbook)
    .await?;
  let token = uuid::Uuid::new_v4().to_string();
  let (completion, accepted) = tokio::sync::oneshot::channel();
  state
    .windows
    .put_transfer(
      token.clone(),
      Transfer {
        source: state.window_id.clone(),
        target: target.clone(),
        document_id: id,
        payload,
        completion: Some(completion),
      },
    )
    .await?;
  let _ = app.emit_to(&target, "native:document-transfer", ());
  if let Some(window) = app.get_webview_window(&target) {
    #[cfg(desktop)]
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
  drop(_handoff);
  match tokio::time::timeout(std::time::Duration::from_secs(45), accepted).await {
    Ok(Ok(Ok(()))) => Ok(json!({"token":token,"windowId":target})),
    outcome => {
      state.windows.cancel_transfer(&token).await;
      Err(match outcome {
        Ok(Ok(Err(error))) => error,
        _ => "目标窗口未接收导图，请重试".into(),
      })
    }
  }
}
pub async fn receive(state: &AppState) -> Result<Value, String> {
  Ok(match state.windows.transfer(&state.window_id).await {
    Some((token, session)) => json!({"token":token,"session":session}),
    None => Value::Null,
  })
}
pub async fn focus_owner(app: &AppHandle, state: &AppState, path: &std::path::Path) -> bool {
  let Some((owner, id)) = state.windows.path_owner(path).await else {
    return false;
  };
  let _ = app.emit_to(&owner, "native:focus-document", &id);
  if let Some(window) = app.get_webview_window(&owner) {
    #[cfg(desktop)]
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
  true
}

pub async fn acknowledge(state: &AppState, token: &str) -> Result<(), String> {
  let _handoff = state.windows.handoff.lock().await;
  let mut transfer = state
    .windows
    .accept_transfer(&state.window_id, token)
    .await?;
  let source_state = state.for_window(&transfer.source).await?;
  let id = &transfer.document_id;
  let mut source = source_state.session.lock().await;
  let mut destination = state.session.lock().await;
  let mut duplicate_retention = None;
  if let Some(path) = source.sources.remove(id) {
    if source.retained.remove(&path) && !destination.retained.insert(path.clone()) {
      duplicate_retention = Some(path.clone());
    }
    if source.authorized.remove(&path) {
      destination.authorized.insert(path.clone());
    }
    destination.sources.insert(id.clone(), path);
  }
  if let Some(key) = source.passwords.remove(id) {
    destination.passwords.insert(id.clone(), key);
  }
  if source.recovery_ids.remove(id) {
    destination.recovery_ids.insert(id.clone());
  }
  drop(source);
  drop(destination);
  if let Some(path) = duplicate_retention {
    let _ = state.documents.release(path).await;
  }
  if let Some(completion) = transfer.completion.take() {
    let _ = completion.send(Ok(()));
  }
  Ok(())
}
