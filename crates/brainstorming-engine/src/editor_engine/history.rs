use super::{history_state::Session, topic, workbook};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::{OwnedRwLockReadGuard, OwnedSemaphorePermit, RwLock, Semaphore};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineSnapshot {
  pub session_id: String,
  pub revision: u64,
  pub workbook: Value,
  pub can_undo: bool,
  pub can_redo: bool,
}

struct Admission {
  _lifecycle: OwnedRwLockReadGuard<bool>,
  _pending: OwnedSemaphorePermit,
}

#[derive(Clone)]
pub struct EditorEngine {
  sessions: Arc<Mutex<HashMap<String, Arc<Mutex<Session>>>>>,
  workers: Arc<Semaphore>,
  lifecycle: Arc<RwLock<bool>>,
  pending: Arc<Semaphore>,
}

impl Default for EditorEngine {
  fn default() -> Self {
    Self {
      sessions: Arc::new(Mutex::new(HashMap::new())),
      workers: Arc::new(Semaphore::new(4)),
      lifecycle: Arc::new(RwLock::new(false)),
      pending: Arc::new(Semaphore::new(64)),
    }
  }
}

impl EditorEngine {
  pub async fn open(&self, session_id: String, workbook: Value) -> Result<EngineSnapshot, String> {
    let admission = self.admit().await?;
    let sessions = self.sessions.clone();
    let permit = self
      .workers
      .clone()
      .acquire_owned()
      .await
      .map_err(|_| "编辑器正在关闭")?;
    tokio::task::spawn_blocking(move || {
      let (_permit, _admission) = (permit, admission);
      crate::document::validate_workbook(&workbook).map_err(|error| error.to_string())?;
      let session = Session::new(workbook)?;
      let requested_id = session.workbook["id"].clone();
      let chosen = {
        let mut guard = sessions.lock().map_err(|_| "会话锁已损坏")?;
        if !guard.contains_key(&session_id) && guard.len() >= 32 {
          return Err("最多同时打开 32 份导图".into());
        }
        guard
          .entry(session_id.clone())
          .or_insert_with(|| Arc::new(Mutex::new(session)))
          .clone()
      };
      let chosen = chosen.lock().map_err(|_| "会话锁已损坏")?;
      if chosen.workbook["id"] != requested_id {
        return Err("会话 ID 已属于其他工作簿".to_owned());
      }
      Ok(chosen.snapshot(&session_id))
    })
    .await
    .map_err(|error| error.to_string())?
  }

  pub async fn snapshot(&self, session_id: &str) -> Result<EngineSnapshot, String> {
    let admission = self.admit().await?;
    let session = self.session(session_id)?;
    let session_id = session_id.to_owned();
    let permit = self
      .workers
      .clone()
      .acquire_owned()
      .await
      .map_err(|_| "编辑器正在关闭")?;
    tokio::task::spawn_blocking(move || {
      let (_permit, _admission) = (permit, admission);
      let session = session.lock().map_err(|_| "会话锁已损坏")?;
      Ok(session.snapshot(&session_id))
    })
    .await
    .map_err(|error| error.to_string())?
  }

  pub async fn close(&self, session_id: &str) -> Result<(), String> {
    let _admission = self.admit().await?;
    self
      .sessions
      .lock()
      .map_err(|_| "会话锁已损坏")?
      .remove(session_id);
    Ok(())
  }

  pub async fn execute(
    &self,
    session_id: &str,
    expected_revision: u64,
    operation: Value,
  ) -> Result<EngineSnapshot, String> {
    let admission = self.admit().await?;
    let session = self.session(session_id)?;
    let permit = self
      .workers
      .clone()
      .acquire_owned()
      .await
      .map_err(|_| "编辑器正在关闭")?;
    let session_id = session_id.to_owned();
    tokio::task::spawn_blocking(move || {
      let (_permit, _admission) = (permit, admission);
      let mut state = session.lock().map_err(|_| "会话锁已损坏")?;
      if expected_revision != state.revision {
        return Err("编辑版本已过期".to_owned());
      }
      match operation["kind"].as_str().ok_or("操作类型无效")? {
        "undo" => state.undo()?,
        "redo" => state.redo()?,
        "topic" | "workbook" => {
          let mut candidate = state.workbook.clone();
          match operation["kind"].as_str() {
            Some("topic") => {
              let sheet_id = super::helpers::id(&operation, "sheetId")?;
              let command = super::helpers::field(&operation, "command")?;
              let sheets = candidate["sheets"].as_array_mut().ok_or("画布列表无效")?;
              let sheet = sheets
                .iter_mut()
                .find(|sheet| sheet["id"] == sheet_id)
                .ok_or("画布不存在")?;
              topic::apply(&mut sheet["document"], command)?;
            }
            _ => workbook::apply(
              &mut candidate,
              super::helpers::field(&operation, "command")?,
            )?,
          }
          workbook::cleanup_links(&state.workbook, &mut candidate);
          crate::document::validate_workbook(&candidate).map_err(|error| error.to_string())?;
          state.commit(candidate)?;
        }
        _ => return Err("不支持的编辑操作".to_owned()),
      }
      Ok(state.snapshot(&session_id))
    })
    .await
    .map_err(|error| error.to_string())?
  }

  async fn admit(&self) -> Result<Admission, String> {
    let pending = self
      .pending
      .clone()
      .try_acquire_owned()
      .map_err(|_| "编辑队列已满，请稍后重试")?;
    let admission = self.lifecycle.clone().read_owned().await;
    if *admission {
      return Err("编辑器正在关闭".into());
    }
    Ok(Admission {
      _lifecycle: admission,
      _pending: pending,
    })
  }

  /// Renderer reload drops all memory-only sessions after admitted operations finish.
  pub async fn clear(&self) -> Result<(), String> {
    let admission = self.lifecycle.write().await;
    if *admission {
      return Err("编辑器正在关闭".into());
    }
    self.sessions.lock().map_err(|_| "会话锁已损坏")?.clear();
    Ok(())
  }

  /// The write lease drains running/queued commands before permanently closing admission.
  pub async fn shutdown(&self) -> Result<(), String> {
    let mut admission = self.lifecycle.write().await;
    *admission = true;
    self.workers.close();
    self.pending.close();
    self.sessions.lock().map_err(|_| "会话锁已损坏")?.clear();
    Ok(())
  }

  fn session(&self, session_id: &str) -> Result<Arc<Mutex<Session>>, String> {
    self
      .sessions
      .lock()
      .map_err(|_| "会话锁已损坏")?
      .get(session_id)
      .cloned()
      .ok_or_else(|| "编辑会话不存在".to_owned())
  }
}
