mod search;
pub mod wire;

use crate::layout_engine::{Layout, NodeSize};
use moka::future::Cache;
pub use search::{FindInput, FindMatch};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutInput {
  #[specta(type = wire::WireValue)]
  pub document: Value,
  pub measurements: Vec<NodeSize>,
}

pub struct ComputeService {
  layouts: Cache<[u8; 32], Arc<Layout>>,
  scenes: Cache<[u8; 32], Arc<crate::scene::Scene>>,
  workers: Arc<Semaphore>,
  pending: Arc<Semaphore>,
  closing: CancellationToken,
}
impl Default for ComputeService {
  fn default() -> Self {
    Self {
      layouts: Cache::builder()
        .max_capacity(32 * 1024 * 1024)
        .weigher(|_: &[u8; 32], layout: &Arc<Layout>| {
          (layout.nodes.len() * 160 + layout.edges.len() * 160 + layout.decorations.len() * 128)
            .min(u32::MAX as usize) as u32
        })
        .time_to_idle(Duration::from_secs(300))
        .build(),
      scenes: Cache::builder()
        .max_capacity(32 * 1024 * 1024)
        .weigher(|_: &[u8; 32], scene: &Arc<crate::scene::Scene>| {
          scene.svg.len().min(u32::MAX as usize) as u32
        })
        .time_to_idle(Duration::from_secs(300))
        .build(),
      workers: Arc::new(Semaphore::new(2)),
      pending: Arc::new(Semaphore::new(8)),
      closing: CancellationToken::new(),
    }
  }
}
impl ComputeService {
  pub async fn layout(&self, input: LayoutInput) -> Result<Arc<Layout>, String> {
    if input.measurements.len() > 20_000 {
      return Err("布局主题数量超过限制".into());
    }
    let (input, key) = self
      .run(move || {
        validate_document(&input.document)?;
        let key = cache_key(&input)?;
        Ok((input, key))
      })
      .await?;
    self
      .layouts
      .try_get_with(
        key,
        self.run(move || {
          crate::layout_engine::compute(&input.document, &input.measurements).map(Arc::new)
        }),
      )
      .await
      .map_err(|error| error.to_string())
  }
  pub async fn render(
    &self,
    workbook: Value,
    sheet_id: String,
    include_collapsed: bool,
    geometry: Option<crate::scene::VisualGeometry>,
  ) -> Result<Arc<crate::scene::Scene>, String> {
    let (workbook, sheet_id, geometry, key) = self
      .run(move || {
        let key = cache_key(&(&workbook, &sheet_id, include_collapsed, &geometry))?;
        Ok((workbook, sheet_id, geometry, key))
      })
      .await?;
    self
      .scenes
      .try_get_with(
        key,
        self.run(move || {
          crate::scene::render_with_geometry(
            &workbook,
            &sheet_id,
            include_collapsed,
            geometry.as_ref(),
          )
          .map(Arc::new)
        }),
      )
      .await
      .map_err(|error| error.to_string())
  }
  pub async fn run<T, F>(&self, work: F) -> Result<T, String>
  where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
  {
    let reservation = self
      .pending
      .clone()
      .try_acquire_owned()
      .map_err(|_| "计算队列已满，请稍后重试")?;
    let permit = tokio::select! {
      _ = self.closing.cancelled() => return Err("计算服务已关闭".into()),
      permit = self.workers.clone().acquire_owned() => permit.map_err(|_| "计算服务已关闭")?,
    };
    let closing = self.closing.clone();
    tokio::task::spawn_blocking(move || {
      let (_reservation, _permit) = (reservation, permit);
      if closing.is_cancelled() {
        return Err("计算已取消".to_string());
      }
      let result = work()?;
      if closing.is_cancelled() {
        return Err("计算已取消".to_string());
      }
      Ok(result)
    })
    .await
    .map_err(|_| "计算任务失败".to_string())?
  }
  pub async fn import_text(&self, format: String, text: String) -> Result<Value, String> {
    if !["md", "opml", "txt"].contains(&format.as_str()) || text.len() > 2 * 1024 * 1024 {
      return Err("导入文本格式或大小无效".into());
    }
    self
      .run(move || {
        crate::interchange::import(text.as_bytes(), &format).map(|result| result.workbook)
      })
      .await
  }
  pub fn invalidate(&self) {
    self.layouts.invalidate_all();
    self.scenes.invalidate_all();
  }
  pub async fn shutdown(&self) {
    self.closing.cancel();
    self.workers.close();
    self.invalidate();
    self.layouts.run_pending_tasks().await;
    self.scenes.run_pending_tasks().await;
  }
}
pub(crate) fn validate_document(document: &Value) -> Result<(), String> {
  crate::document::validate_canvas(document).map_err(|error| error.to_string())
}

fn cache_key(input: &impl Serialize) -> Result<[u8; 32], String> {
  let encoded = serde_json::to_vec(input).map_err(|_| "计算输入无效")?;
  if encoded.len() > 64 * 1024 * 1024 {
    return Err("计算输入超过限制".into());
  }
  Ok(Sha256::digest(&encoded).into())
}
