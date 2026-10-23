use super::{
  input::{self, Result},
  state::AppState,
};
use crate::{
  document::{self, CompositeSource, ResourceSource},
  storage::RecoveryEntry,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, path::PathBuf, sync::Arc};

pub(super) fn directory(state: &AppState) -> PathBuf {
  state.directory.join("recovery-sqlite-v2")
}
fn filename(id: &str) -> String {
  format!(
    "{}.{}.brainstorming",
    hex::encode(Sha256::digest(id.as_bytes())),
    uuid::Uuid::new_v4()
  )
}

/// Every write uses fresh native documents. The previous index remains valid until all writes commit.
pub async fn write(state: &AppState, input: &Value) -> Result<()> {
  let entries = input
    .as_array()
    .filter(|v| v.len() <= 32)
    .ok_or("工作区最多恢复 32 个文档")?;
  let mut ids = HashSet::new();
  let mut total = 0;
  let mut workbooks = Vec::new();
  for entry in entries {
    let contents = entry.as_str().ok_or("工作区恢复内容无效")?;
    total += contents.len();
    if total > input::MAX_DOCUMENT {
      return Err("工作区恢复元数据超过 128 MiB".into());
    }
    let workbook = input::workbook(contents)?;
    let id = input::workbook_id(&workbook)?.to_string();
    if !ids.insert(id.clone()) {
      return Err("工作区恢复包含重复文档".into());
    }
    workbooks.push((id, workbook));
  }
  let _guard = state.recovery.lock().await;
  let mut session = state.session.lock().await;
  let previous = state
    .metadata
    .recovery_index()
    .await
    .map_err(|e| e.to_string())?;
  let preserved = previous
    .iter()
    .filter(|entry| {
      !session.recovery_ids.contains(&entry.document_id) && !ids.contains(&entry.document_id)
    })
    .cloned()
    .collect::<Vec<_>>();
  let previous = previous
    .into_iter()
    .filter(|entry| {
      session.recovery_ids.contains(&entry.document_id) || ids.contains(&entry.document_id)
    })
    .collect::<Vec<_>>();
  // The renderer cannot replace an unread encrypted recovery with an unprotected snapshot.
  for entry in &previous {
    let path = directory(state).join(&entry.file_name);
    if ids.contains(&entry.document_id)
      && document::is_encrypted(&path)
        .await
        .map_err(|e| e.to_string())?
      && session.password_for(&entry.document_id).is_none()
    {
      return Err("请先解锁受保护的恢复文档，不能写入明文副本".into());
    }
  }
  tokio::fs::create_dir_all(directory(state))
    .await
    .map_err(|_| "无法创建恢复目录")?;
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
  for entry in &previous {
    if let Ok(source) = state
      .documents
      .source(
        directory(state).join(&entry.file_name),
        session.password_for(&entry.document_id),
      )
      .await
    {
      sources.push(source);
    }
  }
  let source: Arc<dyn ResourceSource> = Arc::new(CompositeSource::new(sources));
  let mut next = Vec::new();
  let operation: Result<()> = async {
    for (id, workbook) in workbooks {
      let name = filename(&id);
      let path = directory(state).join(&name);
      next.push(RecoveryEntry {
        document_id: id.clone(),
        file_name: name,
        protocol_version: 3,
      });
      state
        .documents
        .write(
          &path,
          workbook,
          session.password_for(&id),
          None,
          Some(source.clone()),
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    state
      .metadata
      .replace_recovery_index(preserved.iter().chain(next.iter()).cloned().collect())
      .await
      .map_err(|e| e.to_string())?;
    Ok(())
  }
  .await;
  if operation.is_err() {
    remove(state, &next, &mut session).await;
  } else {
    session.recovery_ids = ids;
    for entry in &next {
      let source = session.sources.get(&entry.document_id);
      if source.is_none_or(|p| p.starts_with(directory(state))) {
        session.sources.insert(
          entry.document_id.clone(),
          directory(state).join(&entry.file_name),
        );
      }
    }
    remove(state, &previous, &mut session).await;
  }
  operation
}
async fn remove(
  state: &AppState,
  entries: &[RecoveryEntry],
  session: &mut super::session::Session,
) {
  for entry in entries {
    let path = directory(state).join(&entry.file_name);
    // The same workbook may already use a new recovery generation or native file.
    if session.sources.get(&entry.document_id) == Some(&path) {
      session.sources.remove(&entry.document_id);
    }
    let _ = state.documents.release(&path).await;
    let _ = tokio::fs::remove_file(&path).await;
  }
}
pub async fn read(state: &AppState) -> Result<Value> {
  let claim = state.windows.claim_recovery().await;
  let _guard = state.recovery.lock().await;
  let entries = state
    .metadata
    .recovery_index()
    .await
    .map_err(|e| e.to_string())?;
  let mut session = state.session.lock().await;
  let mut opened = Vec::new();
  let mut total = 0;
  let result: Result<()> = async {
    for entry in entries
      .into_iter()
      .filter(|entry| claim || session.recovery_ids.contains(&entry.document_id))
      .collect::<Vec<_>>()
    {
      session.recovery_ids.insert(entry.document_id.clone());
      let path = directory(state).join(&entry.file_name);
      let mut item = if document::is_encrypted(&path)
        .await
        .map_err(|e| e.to_string())?
      {
        session.lock(path, None, Some(entry.document_id.clone()))
      } else {
        let workbook = state
          .documents
          .read(&path, None)
          .await
          .map_err(|_| "工作区恢复文件无法读取，请保留恢复目录后重试")?;
        if input::workbook_id(&workbook)? != entry.document_id {
          return Err("恢复工作簿与索引不一致".into());
        }
        let contents = workbook.to_string();
        total += contents.len();
        if total > input::MAX_DOCUMENT {
          return Err("工作区恢复元数据超过 128 MiB".into());
        }
        session.sources.insert(entry.document_id.clone(), path);
        json!({"path":null,"contents":contents})
      };
      item["recoveryId"] = json!(entry.document_id);
      opened.push(item);
    }
    Ok(())
  }
  .await;
  if let Err(error) = result {
    for item in &opened {
      if let Some(token) = item["lockedToken"].as_str() {
        session.pending.remove(token);
      }
    }
    return Err(error);
  }
  Ok(json!(opened))
}
pub use super::recovery_security::{backups, protect_locked, restore};
