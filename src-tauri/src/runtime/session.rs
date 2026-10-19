use super::input::{Result, identifier};
use serde_json::Value;
use std::{
  collections::{HashMap, HashSet, VecDeque},
  path::PathBuf,
  time::{Duration, Instant},
};
use zeroize::Zeroizing;

pub struct PendingUnlock {
  pub source: PathBuf,
  pub exposed_path: Option<String>,
  pub document_id: Option<String>,
  pub expires: Instant,
  pub unlocked: Option<(String, Zeroizing<String>, Value)>,
}
#[derive(Default)]
pub struct Session {
  pub dirty: bool,
  pub preserve_recovery: bool,
  pub close_allowed: bool,
  pub closing: bool,
  pub authorized: HashSet<PathBuf>,
  pub sources: HashMap<String, PathBuf>,
  pub retained: HashSet<PathBuf>,
  pub passwords: HashMap<String, Zeroizing<String>>,
  pub pending: HashMap<String, PendingUnlock>,
  pub open_files: VecDeque<PathBuf>,
  pub recent: Vec<String>,
}
impl Session {
  pub fn password_for(&self, id: &str) -> Option<&str> {
    self.passwords.get(id).map(|s| s.as_str())
  }
  pub fn set_password(&mut self, id: &str, password: Option<String>) -> Result<()> {
    identifier(id)?;
    if let Some(password) = password {
      self
        .passwords
        .insert(id.to_string(), Zeroizing::new(password));
    } else {
      self.passwords.remove(id);
    }
    Ok(())
  }
  pub fn pending(&mut self, token: &str) -> Result<&mut PendingUnlock> {
    self.pending.retain(|_, item| item.expires > Instant::now());
    self
      .pending
      .get_mut(token)
      .ok_or_else(|| "解锁请求已失效，请重新选择文件".into())
  }
  pub fn lock(
    &mut self,
    source: PathBuf,
    exposed_path: Option<String>,
    id: Option<String>,
  ) -> Value {
    self.pending.retain(|_, item| item.expires > Instant::now());
    if self.pending.len() >= 64
      && let Some(oldest) = self
        .pending
        .iter()
        .min_by_key(|(_, p)| p.expires)
        .map(|(k, _)| k.clone())
    {
      self.pending.remove(&oldest);
    }
    let token = uuid::Uuid::new_v4().to_string();
    self.pending.insert(
      token.clone(),
      PendingUnlock {
        source,
        exposed_path: exposed_path.clone(),
        document_id: id,
        expires: Instant::now() + Duration::from_secs(300),
        unlocked: None,
      },
    );
    serde_json::json!({"path":exposed_path,"contents":"","lockedToken":token,"encrypted":true})
  }
  pub fn enqueue(&mut self, path: PathBuf) -> bool {
    if self.open_files.len() >= 32 || self.open_files.contains(&path) {
      return false;
    }
    self.open_files.push_back(path);
    true
  }
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn unlock_tokens_are_bounded_and_expire() {
    let mut session = Session::default();
    let document = session.lock(PathBuf::from("/tmp/example.brainstorming"), None, None);
    let token = document["lockedToken"].as_str().unwrap();
    session.pending(token).unwrap().expires = Instant::now() - Duration::from_secs(1);
    assert!(session.pending(token).is_err());
    for n in 0..80 {
      session.lock(PathBuf::from(format!("/tmp/{n}.brainstorming")), None, None);
    }
    assert_eq!(session.pending.len(), 64);
    for n in 0..40 {
      session.enqueue(PathBuf::from(format!("/tmp/{n}.brainstorming")));
    }
    assert_eq!(session.open_files.len(), 32);
  }
}
