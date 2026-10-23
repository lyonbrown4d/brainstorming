use super::{
  input::{self, Result},
  state::AppState,
};
use crate::{
  document::{self, CompositeSource, ResourceSource},
  interchange,
};
use serde_json::{Value, json};
use std::{
  collections::HashSet,
  path::{Path, PathBuf},
  sync::Arc,
};

pub async fn remember(state: &AppState, session: &mut super::session::Session, path: &Path) {
  match state
    .metadata
    .remember_recent_file(path.to_string_lossy().into_owned())
    .await
  {
    Ok(paths) => session.recent = paths,
    Err(_) => {
      tracing::warn!(operation = "remember_recent_file", window_id = %state.window_id, "无法更新最近文件记录")
    }
  }
}
pub async fn open(state: &AppState, path: PathBuf) -> Result<Value> {
  input::path(&path.to_string_lossy(), false)?;
  let path = tokio::fs::canonicalize(path)
    .await
    .map_err(|_| "无法打开文档文件")?;
  if state
    .windows
    .path_owner(&path)
    .await
    .is_some_and(|(owner, _)| owner != state.window_id)
  {
    return Err("导图已在其他窗口打开".into());
  }
  let metadata = tokio::fs::symlink_metadata(&path)
    .await
    .map_err(|_| "无法打开文档文件")?;
  if !metadata.is_file() {
    return Err("请选择文档文件".into());
  }
  let extension = path
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  if ["xmind", "opml", "md", "markdown", "txt"].contains(&extension.as_str()) {
    static IMPORT_LIMIT: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
    let maximum = if extension == "xmind" {
      32 * 1024 * 1024
    } else {
      8 * 1024 * 1024
    };
    if metadata.len() > maximum {
      return Err("导入文件超过大小限制".into());
    }
    let bytes = tokio::fs::read(&path)
      .await
      .map_err(|_| "无法读取导入文件")?;
    if bytes.len() as u64 > maximum {
      return Err("导入文件超过大小限制".into());
    }
    let name = path
      .file_name()
      .unwrap_or_default()
      .to_string_lossy()
      .to_string();
    let _permit = IMPORT_LIMIT.acquire().await.map_err(|_| "导入服务已关闭")?;
    let imported = tokio::task::spawn_blocking(move || interchange::import(&bytes, &name))
      .await
      .map_err(|_| "导入处理失败")??;
    let mut session = state.session.lock().await;
    remember(state, &mut session, &path).await;
    return Ok(
      json!({"path":null,"sourcePath":path,"contents":imported.workbook.to_string(),"warnings":imported.warnings}),
    );
  }
  let mut session = state.session.lock().await;
  if document::is_encrypted(&path)
    .await
    .map_err(|e| e.to_string())?
  {
    return Ok(session.lock(path.clone(), Some(path.to_string_lossy().to_string()), None));
  }
  let workbook = state
    .documents
    .read(&path, None)
    .await
    .map_err(|e| e.to_string())?;
  let id = input::workbook_id(&workbook)?.to_string();
  session.authorized.insert(path.clone());
  if !session.retained.contains(&path) {
    state
      .documents
      .retain(&path, None)
      .await
      .map_err(|e| e.to_string())?;
    session.retained.insert(path.clone());
  }
  state
    .windows
    .claim_path(path.clone(), &state.window_id, &id)
    .await?;
  state.windows.claim_editor(&state.window_id, &id).await?;
  session.sources.insert(id, path.clone());
  remember(state, &mut session, &path).await;
  Ok(json!({"path":path,"contents":workbook.to_string(),"warnings":[]}))
}
pub async fn save(state: &AppState, path: PathBuf, request: &Value) -> Result<Value> {
  input::path(&path.to_string_lossy(), true)?;
  let workbook = input::workbook(input::text(request, "contents", input::MAX_DOCUMENT)?)?;
  let id = input::workbook_id(&workbook)?.to_string();
  let _recovery_guard = state.recovery.lock().await;
  let mut session = state.session.lock().await;
  if !session.authorized.contains(&path) {
    return Err("请先通过文件对话框选择保存位置".into());
  }
  // Renderer sessions disappear on reload, while native resource sources may
  // remain available for recovery. This list describes live tabs, never grants paths.
  let open_ids = if let Some(value) = request.get("openDocumentIds") {
    let values = value
      .as_array()
      .filter(|items| items.len() <= 32)
      .ok_or("打开的导图列表无效")?;
    let mut ids = HashSet::new();
    for value in values {
      let value = value.as_str().ok_or("打开的导图标识无效")?;
      input::identifier(value)?;
      if !ids.insert(value) {
        return Err("打开的导图列表包含重复标识".into());
      }
    }
    if !ids.contains(id.as_str()) {
      return Err("保存的导图不在当前标签列表中".into());
    }
    Some(ids)
  } else {
    None
  };
  state.windows.claim_editor(&state.window_id, &id).await?;
  // Save As must not give two open workbooks ownership of the same file.
  // Resolve aliases at the native boundary; renderer path strings are not authority.
  let destination = tokio::fs::canonicalize(&path)
    .await
    .unwrap_or_else(|_| path.clone());
  if let Some((owner, previous)) = state.windows.path_owner(&destination).await
    && owner == state.window_id
    && open_ids
      .as_ref()
      .is_some_and(|ids| !ids.contains(previous.as_str()))
  {
    state
      .windows
      .release_path(&state.window_id, &destination)
      .await;
  }
  state
    .windows
    .claim_path(destination.clone(), &state.window_id, &id)
    .await?;
  for (other_id, source) in &session.sources {
    if other_id == &id
      || open_ids
        .as_ref()
        .is_some_and(|ids| !ids.contains(other_id.as_str()))
    {
      continue;
    }
    let canonical = tokio::fs::canonicalize(source)
      .await
      .unwrap_or_else(|_| source.clone());
    if source == &path || canonical == destination {
      return Err("目标文件已在其他导图标签中打开，请选择其他保存位置".into());
    }
  }
  let previous = session.password_for(&id).map(str::to_string);
  let key = match request.get("password") {
    Some(Value::Null) => None,
    Some(v) => {
      let value = v.as_str().ok_or("密码格式无效")?;
      input::password(value, true)?;
      Some(value.to_string())
    }
    None => previous.clone(),
  };
  if key != previous {
    super::recovery::protect_locked(state, &id, previous.as_deref(), key.as_deref()).await?;
  }
  let result: Result<Value> = async {
    let mut sources: Vec<Arc<dyn ResourceSource>> = vec![state.vault.clone()];
    for (document_id, source) in &session.sources {
      let source_password =
        if document_id == &id && source.starts_with(state.directory.join("recovery-sqlite-v2")) {
          key.as_deref()
        } else {
          session.password_for(document_id)
        };
      sources.push(
        state
          .documents
          .source(source, source_password)
          .await
          .map_err(|e| e.to_string())?,
      );
    }
    let source: Arc<dyn ResourceSource> = Arc::new(CompositeSource::new(sources));
    state
      .documents
      .write(
        &path,
        workbook,
        key.as_deref(),
        previous.as_deref(),
        Some(source),
      )
      .await
      .map_err(|error| error.to_string())
  }
  .await;
  if let Err(error) = result {
    if key != previous {
      super::recovery::protect_locked(state, &id, key.as_deref(), previous.as_deref())
        .await
        .map_err(|_| "保存失败，恢复文件密码回滚失败；请保留恢复目录".to_string())?;
    }
    return Err(error.to_string());
  }
  session.set_password(&id, key.clone())?;
  if !session.retained.contains(&path) {
    state
      .documents
      .retain(&path, key.as_deref())
      .await
      .map_err(|e| e.to_string())?;
    session.retained.insert(path.clone());
  }
  session.sources.insert(id, path.clone());
  remember(state, &mut session, &path).await;
  Ok(json!(path))
}
pub use super::document_security::{activate, set_password, unlock};
