use super::Result;
use crate::export_image::{ExportLease, ImageExportService};
use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

type Jobs = Arc<Mutex<HashMap<Uuid, (String, CancellationToken)>>>;
#[derive(Default)]
pub struct DocumentExportService {
  limiter: ImageExportService,
  jobs: Jobs,
  completed: Mutex<HashMap<String, Vec<String>>>,
}
pub struct Job {
  pub id: Uuid,
  pub token: CancellationToken,
  jobs: Jobs,
  _lease: ExportLease,
}
impl Job {
  pub fn check(&self) -> Result<()> {
    if self.token.is_cancelled() {
      Err("导出已取消".into())
    } else {
      Ok(())
    }
  }
}
impl Drop for Job {
  fn drop(&mut self) {
    if let Ok(mut jobs) = self.jobs.lock() {
      jobs.remove(&self.id);
    }
  }
}
struct Pending {
  id: Uuid,
  jobs: Jobs,
  armed: bool,
}
impl Drop for Pending {
  fn drop(&mut self) {
    if self.armed {
      if let Ok(mut jobs) = self.jobs.lock() {
        jobs.remove(&self.id);
      }
    }
  }
}
impl DocumentExportService {
  pub async fn enter(&self, owner: &str, id: Uuid) -> Result<Job> {
    let token = self.limiter.cancellation().child_token();
    {
      let mut jobs = self.jobs.lock().map_err(|_| "导出队列不可用")?;
      if jobs.len() >= 4 {
        return Err("导出队列已满，请稍后重试".into());
      }
      if jobs.contains_key(&id) {
        return Err("导出任务已存在".into());
      }
      jobs.insert(id, (owner.into(), token.clone()));
    }
    let mut pending = Pending {
      id,
      jobs: self.jobs.clone(),
      armed: true,
    };
    let lease = tokio::select! {
      _ = token.cancelled() => return Err("导出已取消".into()),
      lease = self.limiter.enter(id) => lease?,
    };
    // Move the registration from pending admission to the active worker.
    pending.armed = false;
    let job = Job {
      id,
      token,
      jobs: self.jobs.clone(),
      _lease: lease,
    };
    job.check()?;
    Ok(job)
  }
  pub fn cancel(&self, owner: &str, id: Uuid) -> bool {
    self.jobs.lock().ok().is_some_and(|jobs| {
      jobs.get(&id).is_some_and(|(window, token)| {
        if window != owner {
          return false;
        }
        token.cancel();
        true
      })
    })
  }
  pub fn cancel_window(&self, owner: &str) {
    if let Ok(mut completed) = self.completed.lock() {
      completed.remove(owner);
    }
    if let Ok(jobs) = self.jobs.lock() {
      for (window, token) in jobs.values() {
        if window == owner {
          token.cancel();
        }
      }
    }
  }
  pub fn remember_export(&self, owner: &str, path: &str) {
    if let Ok(mut all) = self.completed.lock() {
      let paths = all.entry(owner.into()).or_default();
      paths.retain(|existing| existing != path);
      paths.push(path.into());
      if paths.len() > 32 {
        paths.remove(0);
      }
    }
  }
  pub fn has_export(&self, owner: &str, path: &str) -> bool {
    self.completed.lock().is_ok_and(|all| {
      all
        .get(owner)
        .is_some_and(|paths| paths.iter().any(|value| value == path))
    })
  }
  pub fn begin_shutdown(&self) {
    self.limiter.begin_shutdown();
  }
  pub async fn shutdown(&self) {
    self.limiter.shutdown().await;
  }
}
