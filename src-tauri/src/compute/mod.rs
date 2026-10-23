mod cache_key;
mod search;
mod spatial;
pub mod wire;

use crate::layout_engine::{Layout, NodeSize};
use cache_key::cache_key;
use moka::future::Cache;
pub use search::{FindInput, FindMatch};
use serde::{Deserialize, Serialize};
use serde_json::Value;
pub use spatial::SpatialLayout;
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
  spatial_layouts: Cache<[u8; 32], Arc<SpatialLayout>>,
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
      spatial_layouts: Cache::builder()
        .max_capacity(32 * 1024 * 1024)
        .weigher(|_: &[u8; 32], spatial: &Arc<SpatialLayout>| {
          (spatial.layout.nodes.len() * 160
            + spatial.layout.edges.len() * 160
            + spatial.layout.decorations.len() * 128
            + spatial.depths.len() * 64)
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
  pub async fn spatial_layout(&self, input: LayoutInput) -> Result<Arc<SpatialLayout>, String> {
    if input.measurements.len() > 20_000 {
      return Err("布局主题数量超过限制".into());
    }
    let (input, key) = self
      .run(move || {
        validate_document(&input.document)?;
        let mut key_document = input.document.clone();
        if let Some(spatial) = key_document
          .get_mut("settings")
          .and_then(|settings| settings.get_mut("spatial"))
          .and_then(Value::as_object_mut)
        {
          spatial.remove("mode");
          spatial.remove("yaw");
          spatial.remove("pitch");
          spatial.remove("target");
        }
        let key = cache_key(&(&key_document, &input.measurements))?;
        Ok((input, key))
      })
      .await?;
    self
      .spatial_layouts
      .try_get_with(key, async {
        let layout = self.layout(input.clone()).await?;
        let depths = self.run(move || spatial::depths(&input.document)).await?;
        Ok::<Arc<SpatialLayout>, String>(Arc::new(SpatialLayout {
          layout: (*layout).clone(),
          depths,
        }))
      })
      .await
      .map_err(|error| error.to_string())
  }
  pub async fn layout(&self, input: LayoutInput) -> Result<Arc<Layout>, String> {
    if input.measurements.len() > 20_000 {
      return Err("布局主题数量超过限制".into());
    }
    let (input, key) = self
      .run(move || {
        validate_document(&input.document)?;
        let key = layout_cache_key(&input)?;
        Ok((input, key))
      })
      .await?;
    self
      .layouts
      .try_get_with(
        key,
        self.run(move || {
          let measurements = if input.measurements.is_empty() {
            crate::scene::measure_document(&input.document)?
          } else {
            input.measurements
          };
          crate::layout_engine::compute(&input.document, &measurements).map(Arc::new)
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
    self.spatial_layouts.invalidate_all();
    self.scenes.invalidate_all();
  }
  pub async fn shutdown(&self) {
    self.closing.cancel();
    self.workers.close();
    self.invalidate();
    self.layouts.run_pending_tasks().await;
    self.spatial_layouts.run_pending_tasks().await;
    self.scenes.run_pending_tasks().await;
  }
}
pub(crate) fn validate_document(document: &Value) -> Result<(), String> {
  crate::document::validate_canvas(document).map_err(|error| error.to_string())
}

/// Screen geometry does not depend on spatial camera, spacing, or topic depth.
/// Sharing this key lets spatial requests reuse the native 2D layout cache.
fn layout_cache_key(input: &LayoutInput) -> Result<[u8; 32], String> {
  let mut document = input.document.clone();
  if let Some(settings) = document.get_mut("settings").and_then(Value::as_object_mut) {
    settings.remove("spatial");
  }
  if let Some(topics) = document.get_mut("topics").and_then(Value::as_object_mut) {
    for topic in topics.values_mut() {
      if let Some(style) = topic.get_mut("style").and_then(Value::as_object_mut) {
        style.remove("spatialDepth");
      }
    }
  }
  cache_key(&(&document, &input.measurements))
}

#[cfg(test)]
mod cache_tests {
  use super::{LayoutInput, layout_cache_key};
  use serde_json::json;

  #[test]
  fn native_2d_layout_cache_ignores_spatial_configuration() {
    let original = LayoutInput {
      document: json!({
        "settings": { "layout": "map", "spatial": { "mode": "2d", "spacing": 100 } },
        "topics": { "root": { "style": { "offsetX": 10, "spatialDepth": 0 } } }
      }),
      measurements: vec![],
    };
    let mut changed = original.clone();
    changed.document["settings"]["spatial"] =
      json!({ "mode": "3d", "yaw": 0.8, "pitch": 0.4, "spacing": 140 });
    changed.document["topics"]["root"]["style"]["spatialDepth"] = json!(80);
    assert_eq!(
      layout_cache_key(&original).unwrap(),
      layout_cache_key(&changed).unwrap()
    );
    changed.document["topics"]["root"]["style"]["offsetX"] = json!(11);
    assert_ne!(
      layout_cache_key(&original).unwrap(),
      layout_cache_key(&changed).unwrap()
    );
  }
}
