use super::{AppState, compute, document_previews, input};
use crate::{
  document::{MAX_PREVIEW_BYTES, MAX_PREVIEW_DIMENSION, MAX_TOTAL_PREVIEW_BYTES, SheetPreview},
  export_image::{Format, Request, Stage},
  scene,
};
use serde_json::Value;
use std::sync::Arc;
use tauri::AppHandle;

/// Render a saved plaintext revision and atomically attach bounded previews to that revision.
pub async fn refresh(app: &AppHandle, state: &AppState, input_value: Value) -> Result<(), String> {
  let id = input::text(&input_value, "documentId", 4096)?;
  input::identifier(id)?;
  let contents = input::text(&input_value, "contents", input::MAX_DOCUMENT)?;
  let workbook = input::workbook(contents)?;
  let Some(revision) = document_previews::revision_workbook(state, id, &workbook).await? else {
    return Ok(());
  };
  let sheets = workbook["sheets"].as_array().ok_or("画布列表无效")?;
  let count = sheets.len();
  if count == 0 || count > 128 {
    return Err("预览画布数量无效".into());
  }
  let cover_requested = input::text(&input_value, "coverSheetId", 4096)?;
  let parsed = sheets
    .iter()
    .map(|sheet| {
      sheet["id"]
        .as_str()
        .map(str::to_owned)
        .ok_or("画布标识无效")
    })
    .collect::<Result<Vec<_>, _>>()?;
  let cover = if parsed.iter().any(|sheet_id| sheet_id == cover_requested) {
    cover_requested.to_owned()
  } else {
    parsed[0].clone()
  };
  let workbook = compute::hydrate_for(app, state, workbook, false).await?;
  let budget = MAX_PREVIEW_BYTES.min(MAX_TOTAL_PREVIEW_BYTES / count);
  let mut total = 0usize;
  let mut previews = Vec::with_capacity(count);
  for sheet_id in parsed {
    let scene = state
      .compute
      .render(workbook.clone(), sheet_id.clone(), false, None)
      .await?;
    let png = fit_preview(state, &scene, budget).await?;
    total = total.checked_add(png.len()).ok_or("文档预览超过限制")?;
    if total > MAX_TOTAL_PREVIEW_BYTES {
      return Err("文档预览超过限制".into());
    }
    previews.push(SheetPreview { sheet_id, png });
  }
  document_previews::write_bytes(state, id, revision, cover, previews).await?;
  Ok(())
}

async fn fit_preview(
  state: &AppState,
  scene: &scene::Scene,
  budget: usize,
) -> Result<Vec<u8>, String> {
  let final_dimension = (budget as f64 / 5.0).sqrt().floor().clamp(1.0, 384.0) as u32;
  for dimension in [MAX_PREVIEW_DIMENSION, 1024, 640, final_dimension] {
    let scale = (dimension as f64 / scene.width.max(scene.height)).min(1.0);
    let request = Request {
      job_id: uuid::Uuid::new_v4(),
      format: Format::Png,
      suggested_name: "preview.png".into(),
      svg: scene.svg.clone(),
      width: scene.width,
      height: scene.height,
      scale: Some(scale),
      quality: None,
    };
    let lease = state.image_exports.enter(request.job_id).await?;
    let report: crate::export_image::Reporter = Arc::new(|_stage: Stage| {});
    let (png, lease) = state.image_exports.render(request, lease, report).await?;
    drop(lease);
    if png.len() <= budget {
      return Ok(png);
    }
  }
  Err("画布预览 PNG 超过 1 MiB 限制".into())
}
