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

fn directory(state: &AppState) -> PathBuf {
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
            .replace_recovery_index(next.clone())
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;
    if operation.is_err() {
        remove(state, &next).await;
    } else {
        for entry in &next {
            let source = session.sources.get(&entry.document_id);
            if source.is_none_or(|p| p.starts_with(directory(state))) {
                session.sources.insert(
                    entry.document_id.clone(),
                    directory(state).join(&entry.file_name),
                );
            }
        }
        remove(state, &previous).await;
    }
    operation
}
async fn remove(state: &AppState, entries: &[RecoveryEntry]) {
    for entry in entries {
        let path = directory(state).join(&entry.file_name);
        let _ = state.documents.release(&path).await;
        let _ = tokio::fs::remove_file(&path).await;
    }
}
pub async fn read(state: &AppState) -> Result<Value> {
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
        for entry in entries {
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
