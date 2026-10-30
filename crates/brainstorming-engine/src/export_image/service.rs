use super::{Reporter, Request, Result, raster};
use std::{
  collections::HashSet,
  sync::{Arc, Mutex, OnceLock},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;

const CAPACITY: u32 = 4;
pub struct ImageExportService {
  pending: Arc<Semaphore>,
  active: Arc<Semaphore>,
  jobs: Arc<Mutex<HashSet<uuid::Uuid>>>,
  closing: CancellationToken,
  fonts: Arc<OnceLock<Arc<resvg::usvg::fontdb::Database>>>,
}
/// Owned by the render worker, then by the writer, so abandoned callers cannot release
/// the concurrency limit while a blocking render is still using memory.
pub struct ExportLease {
  _reservation: Reservation,
  _active: OwnedSemaphorePermit,
}
struct Reservation {
  _pending: OwnedSemaphorePermit,
  job_id: uuid::Uuid,
  jobs: Arc<Mutex<HashSet<uuid::Uuid>>>,
}
impl Drop for Reservation {
  fn drop(&mut self) {
    if let Ok(mut jobs) = self.jobs.lock() {
      jobs.remove(&self.job_id);
    }
  }
}
impl Default for ImageExportService {
  fn default() -> Self {
    Self {
      pending: Arc::new(Semaphore::new(CAPACITY as usize)),
      active: Arc::new(Semaphore::new(1)),
      jobs: Arc::new(Mutex::new(HashSet::new())),
      closing: CancellationToken::new(),
      fonts: Arc::new(OnceLock::new()),
    }
  }
}
impl ImageExportService {
  pub fn cancellation(&self) -> CancellationToken {
    self.closing.clone()
  }
  pub fn ensure_open(&self) -> Result<()> {
    if self.closing.is_cancelled() {
      Err("图片导出服务已关闭".into())
    } else {
      Ok(())
    }
  }
  pub async fn enter(&self, job_id: uuid::Uuid) -> Result<ExportLease> {
    self.ensure_open()?;
    let pending = self
      .pending
      .clone()
      .try_acquire_owned()
      .map_err(|_| "图片导出队列已满，请稍后重试")?;
    if !self
      .jobs
      .lock()
      .map_err(|_| "图片导出队列不可用")?
      .insert(job_id)
    {
      return Err("图片导出任务已存在".into());
    }
    let reservation = Reservation {
      _pending: pending,
      job_id,
      jobs: self.jobs.clone(),
    };
    let active = tokio::select! {
        biased;
        _ = self.closing.cancelled() => return Err("图片导出服务已关闭".into()),
        active = self.active.clone().acquire_owned() => active.map_err(|_| "图片导出服务已关闭")?,
    };
    self.ensure_open()?;
    Ok(ExportLease {
      _reservation: reservation,
      _active: active,
    })
  }
  pub async fn render(
    &self,
    request: Request,
    lease: ExportLease,
    report: Reporter,
  ) -> Result<(Vec<u8>, ExportLease)> {
    self.ensure_open()?;
    let fonts = self.fonts.clone();
    let closing = self.closing.clone();
    tokio::task::spawn_blocking(move || {
      if closing.is_cancelled() {
        return Err("图片导出服务已关闭".into());
      }
      let fonts = fonts.get_or_init(raster::fonts).clone();
      let bytes = raster::render(request, fonts, report)?;
      if closing.is_cancelled() {
        return Err("图片导出服务已关闭".into());
      }
      Ok((bytes, lease))
    })
    .await
    .map_err(|_| "图片导出任务失败")?
  }
  /// Revoke producers before the outer command admission guard is drained.
  pub fn begin_shutdown(&self) {
    self.closing.cancel();
    self.active.close();
  }
  /// Cancel queued requests/pickers, retain active workers, and drain before dependencies close.
  pub async fn shutdown(&self) {
    self.begin_shutdown();
    if let Ok(permit) = self.pending.clone().acquire_many_owned(CAPACITY).await {
      self.pending.close();
      drop(permit);
    }
  }
}
