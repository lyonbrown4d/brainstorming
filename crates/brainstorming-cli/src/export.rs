use crate::args::Export;
use brainstorming_engine::{
  application::ExportApplication,
  document::DocumentSnapshot,
  document_exports::{
    ExportContent, ExportFormat, Request, assets, destination, encode, pipeline, scope,
  },
  storage::atomic,
};
use serde_json::{Value, json};
use std::sync::Arc;

pub async fn run(
  args: &Export,
  snapshot: &DocumentSnapshot,
  app: &ExportApplication,
) -> Result<Value, String> {
  let extension = args
    .output
    .extension()
    .and_then(|v| v.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  let format = args.format.as_deref().unwrap_or(&extension);
  let format: ExportFormat = match format {
    "png" => ExportFormat::Png,
    "jpg" | "jpeg" => ExportFormat::Jpg,
    "webp" => ExportFormat::Webp,
    "svg" => ExportFormat::Svg,
    "pdf" => ExportFormat::Pdf,
    _ => return Err("请选择 png、jpg、webp、svg 或 pdf；多画布 ZIP 还须指定 --format".into()),
  };
  let sheets = snapshot.workbook()["sheets"]
    .as_array()
    .ok_or("画布列表无效")?;
  let ids = if args.all_sheets {
    sheets
      .iter()
      .filter_map(|s| s["id"].as_str())
      .map(str::to_owned)
      .collect::<Vec<_>>()
  } else if !args.sheet.is_empty() {
    args.sheet.clone()
  } else {
    vec![
      sheets
        .first()
        .and_then(|s| s["id"].as_str())
        .ok_or("文档没有画布")?
        .into(),
    ]
  };
  let mut request: Request = serde_json::from_value(json!({
    "jobId":uuid::Uuid::new_v4(),"workbook":snapshot.workbook(),"format":format,
    "sheetIds":ids,"includeCollapsed":args.include_collapsed,"transparent":args.transparent,
    "content":if args.presentation { ExportContent::Presentation } else { ExportContent::Map },
    "scale":args.scale,"width":args.width,"height":args.height,"jpegQuality":args.jpeg_quality
  }))
  .map_err(|_| "导出参数无效")?;
  request.validate()?;
  let job = app.exports.enter("cli", request.job_id).await?;
  request.workbook = scope::select(&request)?;
  if request.format.needs_assets() {
    request.workbook = assets::hydrate(snapshot, request.workbook, false).await?;
  }
  job.check()?;
  let progress: pipeline::Reporter = Arc::new(|_, _, _| {});
  let pages = pipeline::prepare_pages(&app.compute, &request, &job, &progress).await?;
  let extension = encode::extension(&request, pages.len()).to_owned();
  let source = vec![snapshot.path().to_owned()];
  destination::validate(&args.output, &extension, &source)?;
  if !args.overwrite && args.output.symlink_metadata().is_ok() {
    return Err("目标文件已存在；如需替换，请使用 --overwrite".into());
  }
  let (job, bytes) = pipeline::encode(request, pages, job, app.compute.clone()).await?;
  job.check()?;
  destination::validate(&args.output, &extension, &source)?;
  let size = bytes.len();
  atomic::write_export(&args.output, bytes, args.overwrite).await?;
  drop(job);
  Ok(json!({"path":args.output,"format":extension,"bytes":size}))
}
