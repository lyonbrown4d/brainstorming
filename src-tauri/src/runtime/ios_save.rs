use super::{
  AppState, documents,
  input::{self, Result},
  native_files,
};
use crate::document::{CompositeSource, ResourceSource};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc};
use tauri::{AppHandle, Manager};

pub async fn save_new(app: &AppHandle, state: &AppState, request: &Value) -> Result<Value> {
  let workbook = input::workbook(input::text(request, "contents", input::MAX_DOCUMENT)?)?;
  let id = input::workbook_id(&workbook)?.to_string();
  let suggested = input::safe_name(input::text(request, "suggestedName", 4096)?);
  let name = if suggested.to_lowercase().ends_with(".brainstorming") {
    suggested
  } else {
    format!("{suggested}.brainstorming")
  };
  let directory = state
    .directory
    .join("mobile-documents")
    .join(uuid::Uuid::new_v4().to_string());
  tokio::fs::create_dir_all(&directory)
    .await
    .map_err(|_| "无法创建文档目录")?;
  let path = directory.join(&name);
  let _guard = state.recovery.lock().await;
  let mut session = state.session.lock().await;
  let previous = session.password_for(&id).map(str::to_string);
  let key = match request.get("password") {
    Some(Value::Null) => None,
    Some(value) => {
      let key = value.as_str().ok_or("密码格式无效")?;
      input::password(key, true)?;
      Some(key.to_string())
    }
    None => previous.clone(),
  };
  let mut sources: Vec<Arc<dyn ResourceSource>> = vec![state.vault.clone()];
  for (id, path) in &session.sources {
    sources.push(
      state
        .documents
        .source(path, session.password_for(id))
        .await
        .map_err(|e| e.to_string())?,
    );
  }
  state
    .documents
    .write(
      &path,
      workbook,
      key.as_deref(),
      None,
      Some(Arc::new(CompositeSource::new(sources))),
    )
    .await
    .map_err(|e| e.to_string())?;
  let selected = native_files::export_completed(app, &path, &name, "brainstorming").await;
  if !matches!(&selected, Ok(Some(_))) {
    let _ = state.documents.release(&path).await;
    let _ = tokio::fs::remove_dir_all(&directory).await;
    return selected.map(|_| Value::Null);
  }
  if key != previous {
    super::recovery::protect_locked(state, &id, previous.as_deref(), key.as_deref()).await?;
  }
  session.set_password(&id, key.clone())?;
  state
    .documents
    .retain(&path, key.as_deref())
    .await
    .map_err(|e| e.to_string())?;
  session.retained.insert(path.clone());
  session.authorized.insert(path.clone());
  session.sources.insert(id, path.clone());
  documents::remember(state, &mut session, &path).await;
  Ok(json!(path))
}
pub async fn export(app: &AppHandle, bytes: &[u8], suggested: &str, format: &str) -> Result<Value> {
  let root = app
    .path()
    .app_data_dir()
    .map_err(|_| "本机存储目录不可用")?
    .join("export-staging");
  let temporary = root.join(uuid::Uuid::new_v4().to_string());
  tokio::fs::create_dir_all(&temporary)
    .await
    .map_err(|_| "无法创建导出文件")?;
  let name = input::safe_name(suggested);
  let path: PathBuf = temporary.join(if name.ends_with(&format!(".{format}")) {
    name
  } else {
    format!("{name}.{format}")
  });
  super::atomic::write(&path, bytes).await?;
  use tauri_plugin_brainstorming_native::NativeBridgeExt;
  let response = app
    .native_bridge()
    .call("exportFile", json!({"path":path,"suggestedName":suggested}))
    .await
    .map_err(|_| "无法导出所选文件")?;
  let _ = tokio::fs::remove_dir_all(temporary).await;
  Ok(response.get("uri").cloned().unwrap_or(Value::Null))
}
