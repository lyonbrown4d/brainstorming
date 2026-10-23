use super::{
  AppState,
  input::{self, Result},
  recovery::directory,
};
use crate::document;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub async fn protect_locked(
  state: &AppState,
  id: &str,
  previous: Option<&str>,
  password: Option<&str>,
) -> Result<()> {
  let stem = format!("{}.", hex::encode(Sha256::digest(id.as_bytes())));
  let mut paths = Vec::new();
  match tokio::fs::read_dir(directory(state)).await {
    Ok(mut entries) => {
      while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|_| "无法检查恢复文件密码")?
      {
        let name = entry.file_name().to_string_lossy().to_string();
        let revision = name
          .strip_prefix(&stem)
          .and_then(|value| value.strip_suffix(".brainstorming"));
        if revision.is_some_and(|revision| uuid::Uuid::parse_str(revision).is_ok()) {
          paths.push(entry.path());
        }
      }
    }
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
    Err(_) => return Err("无法检查恢复文件密码".into()),
  }
  let mut changed = Vec::new();
  for path in paths {
    let encrypted = document::is_encrypted(&path)
      .await
      .map_err(|e| e.to_string())?;
    if encrypted && previous.is_none() {
      return Err("请先解锁受保护的恢复文档".into());
    }
    let prior = if encrypted { previous } else { None };
    if let Err(error) = state.documents.rekey(&path, prior, password).await {
      for (prior_path, prior_key) in changed {
        state
          .documents
          .rekey(prior_path, password, prior_key)
          .await
          .map_err(|_| "恢复文件密码更新及回滚失败，请保留恢复目录")?;
      }
      return Err(error.to_string());
    }
    changed.push((path, prior));
  }
  Ok(())
}
pub async fn backups(state: &AppState, id: &str) -> Result<Value> {
  input::identifier(id)?;
  let session = state.session.lock().await;
  let Some(path) = session.sources.get(id) else {
    return Ok(json!([]));
  };
  let revisions = state
    .documents
    .revisions(path, session.password_for(id))
    .await
    .map_err(|e| e.to_string())?;
  let folder = hex::encode(Sha256::digest(id.as_bytes()));
  Ok(Value::Array(revisions.into_iter().map(|entry| {
        let created = chrono::DateTime::parse_from_rfc3339(&entry.created_at).map(|d| d.timestamp_millis()).unwrap_or(0);
        json!({"id":format!("{folder}/{}",entry.id),"createdAt":created,"size":0,"encrypted":session.password_for(id).is_some()})
    }).collect()))
}
pub async fn restore(state: &AppState, id: &str) -> Result<Value> {
  let (folder, revision) = id.split_once('/').ok_or("版本标识无效")?;
  uuid::Uuid::parse_str(revision).map_err(|_| "版本标识无效")?;
  let session = state.session.lock().await;
  let (document_id, path) = session
    .sources
    .iter()
    .find(|(id, _)| hex::encode(Sha256::digest(id.as_bytes())) == folder)
    .ok_or("版本文档尚未打开，请先打开原生文件")?;
  let workbook = state
    .documents
    .read_revision(path, revision, session.password_for(document_id))
    .await
    .map_err(|e| e.to_string())?;
  if input::workbook_id(&workbook)? != document_id {
    return Err("版本文件与文档不一致".into());
  }
  Ok(
    json!({"path":null,"contents":workbook.to_string(),"encrypted":session.password_for(document_id).is_some()}),
  )
}
