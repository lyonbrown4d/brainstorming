use super::{
    input::{self, Result},
    state::AppState,
};
use crate::document::{self, CompositeSource, ResourceSource};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Arc,
};

pub async fn remember(state: &AppState, session: &mut super::session::Session, path: &Path) {
    let path = path.to_string_lossy().to_string();
    session.recent.retain(|p| p != &path);
    session.recent.insert(0, path);
    session.recent.truncate(10);
    let _ = state
        .metadata
        .replace_recent_files(session.recent.clone())
        .await;
}
pub async fn open(state: &AppState, path: PathBuf) -> Result<Value> {
    input::path(&path.to_string_lossy(), false)?;
    let path = tokio::fs::canonicalize(path)
        .await
        .map_err(|_| "无法打开文档文件")?;
    let metadata = tokio::fs::symlink_metadata(&path)
        .await
        .map_err(|_| "无法打开文档文件")?;
    if !metadata.is_file() {
        return Err("请选择文档文件".into());
    }
    if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("xmind"))
    {
        if metadata.len() > 32 * 1024 * 1024 {
            return Err("文件超过 32 MiB".into());
        }
        let bytes = tokio::fs::read(&path)
            .await
            .map_err(|_| "无法读取 XMind 文件")?;
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let mut session = state.session.lock().await;
        remember(state, &mut session, &path).await;
        return Ok(
            json!({"path":null,"sourcePath":path,"contents":"","importSource":{"name":name,"bytes":bytes}}),
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
    // Save As must not give two open workbooks ownership of the same file.
    // Resolve aliases at the native boundary; renderer path strings are not authority.
    let destination = tokio::fs::canonicalize(&path)
        .await
        .unwrap_or_else(|_| path.clone());
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
            let source_password = if document_id == &id
                && source.starts_with(state.directory.join("recovery-sqlite-v2"))
            {
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
pub async fn unlock(state: &AppState, token: &str, password: &str) -> Result<Value> {
    input::password(password, false)?;
    let mut session = state.session.lock().await;
    let pending = session.pending(token)?;
    let workbook = state
        .documents
        .read(&pending.source, Some(password))
        .await
        .map_err(|_| "密码错误或加密文件损坏，请重试")?;
    if pending.expires <= std::time::Instant::now() {
        return Err("解锁请求已失效，请重新选择文件".into());
    }
    let id = input::workbook_id(&workbook)?.to_string();
    if pending
        .document_id
        .as_ref()
        .is_some_and(|expected| expected != &id)
    {
        return Err("恢复工作簿与索引不一致".into());
    }
    pending.unlocked = Some((
        id,
        zeroize::Zeroizing::new(password.to_string()),
        workbook.clone(),
    ));
    Ok(
        json!({"path":pending.exposed_path,"contents":workbook.to_string(),"encrypted":true,"sessionToken":token,"warnings":[]}),
    )
}
pub async fn activate(state: &AppState, token: &str) -> Result<Value> {
    let mut session = state.session.lock().await;
    if session.pending(token)?.unlocked.is_none() {
        return Err("请先解锁文件".into());
    }
    let pending = session.pending(token)?;
    let (id, password, _) = pending.unlocked.as_ref().ok_or("请先解锁文件")?;
    let id = id.clone();
    let password = zeroize::Zeroizing::new(password.to_string());
    let path = pending.source.clone();
    if !session.retained.contains(&path) {
        state
            .documents
            .retain(&path, Some(&password))
            .await
            .map_err(|e| e.to_string())?;
        session.retained.insert(path);
    }
    session.set_password(&id, Some(password.to_string()))?;
    let pending = session.pending.remove(token).ok_or("解锁请求已失效")?;
    session.sources.insert(id, pending.source.clone());
    if pending.exposed_path.is_some() {
        session.authorized.insert(pending.source.clone());
        remember(state, &mut session, &pending.source).await;
    }
    Ok(json!({"encrypted":true}))
}
pub async fn set_password(state: &AppState, id: &str, password: Option<&str>) -> Result<Value> {
    input::identifier(id)?;
    if let Some(password) = password {
        input::password(password, true)?;
    }
    let _guard = state.recovery.lock().await;
    let mut session = state.session.lock().await;
    let previous = session.password_for(id).map(str::to_string);
    if previous.as_deref() == password {
        return Ok(json!({"encrypted":password.is_some()}));
    }
    super::recovery::protect_locked(state, id, previous.as_deref(), password).await?;
    if let Some(path) = session
        .sources
        .get(id)
        .filter(|p| !p.starts_with(state.directory.join("recovery-sqlite-v2")))
        && let Err(error) = state
            .documents
            .rekey(path, previous.as_deref(), password)
            .await
    {
        super::recovery::protect_locked(state, id, password, previous.as_deref())
            .await
            .map_err(|_| "密码更新失败，恢复文件密码回滚失败；请保留恢复目录".to_string())?;
        return Err(error.to_string());
    }
    session.set_password(id, password.map(str::to_string))?;
    Ok(json!({"encrypted":password.is_some()}))
}
