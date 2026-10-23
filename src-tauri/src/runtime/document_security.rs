use super::{
  AppState,
  documents::remember,
  input::{self, Result},
};
use serde_json::{Value, json};

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
  state
    .windows
    .claim_path(path.clone(), &state.window_id, &id)
    .await?;
  state.windows.claim_editor(&state.window_id, &id).await?;
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
  state.windows.claim_editor(&state.window_id, id).await?;
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
