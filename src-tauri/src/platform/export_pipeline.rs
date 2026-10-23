use crate::{
  document_exports::{
    ExportContent, ExportFormat, ExportStage, Page, Progress, Request, encode, scope, service::Job,
  },
  runtime::AppState,
};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub(super) async fn export_job(
  app: &AppHandle,
  state: Arc<AppState>,
  mut request: Request,
  job: Job,
) -> Result<Option<String>, String> {
  report(app, &state.window_id, job.id, ExportStage::Preparing, 0, 1);
  request.workbook = state
    .compute
    .run({
      let request = request.clone();
      move || scope::select(&request)
    })
    .await?;
  job.check()?;
  let needs_assets = request.format.needs_assets();
  if needs_assets {
    request.workbook = crate::runtime::compute::hydrate_for(
      app,
      &state,
      request.workbook,
      request.format == ExportFormat::Xmind,
    )
    .await?;
  }
  job.check()?;
  let mut pages = prepare_pages(&state, &request, &job, app).await?;
  if request.transparent && request.content != ExportContent::Presentation {
    for page in &mut pages {
      remove_background(page)?;
    }
  }
  let format = encode::extension(&request, pages.len()).to_string();
  let name = crate::runtime::input::safe_name(
    request.workbook["title"]
      .as_str()
      .unwrap_or("Brainstorming"),
  );
  let suggested = format!("{name}.{format}");
  report(app, &state.window_id, job.id, ExportStage::Choosing, 0, 1);
  #[cfg(not(target_os = "ios"))]
  let path = tokio::select! {
    _ = job.token.cancelled() => return Ok(None),
    path = crate::runtime::dialogs::save(app, &suggested, &format) => match path? { Some(path) => path, None => return Ok(None) },
  };
  job.check()?;
  report(
    app,
    &state.window_id,
    job.id,
    ExportStage::Encoding,
    0,
    pages.len().max(1),
  );
  let (job, bytes) = tokio::task::spawn_blocking(move || {
    job.check()?;
    let bytes = encode::pages_cancellable(&request, &pages, &|| job.check())?;
    if bytes.len() > 128 * 1024 * 1024 {
      return Err("导出文件超过 128 MiB 限制".into());
    }
    job.check()?;
    Ok::<_, String>((job, bytes))
  })
  .await
  .map_err(|_| "导出编码任务失败")??;
  report(app, &state.window_id, job.id, ExportStage::Writing, 0, 1);
  job.check()?;
  #[cfg(not(target_os = "ios"))]
  let result = {
    let mut sources = Vec::new();
    for label in state.windows.labels().await {
      if let Ok(slot) = state.windows.get(&label).await {
        sources.extend(slot.session.lock().await.sources.values().cloned());
      }
    }
    let target = path.clone();
    let extension = format.clone();
    tokio::task::spawn_blocking(move || {
      crate::document_exports::destination::validate(&target, &extension, &sources)
    })
    .await
    .map_err(|_| "无法检查导出位置")??;
    job.check()?;
    crate::runtime::atomic::write(&path, &bytes).await?;
    crate::runtime::native_files::commit(app, &path).await?;
    path.to_string_lossy().into_owned()
  };
  #[cfg(target_os = "ios")]
  let result = crate::runtime::ios_save::export(app, &bytes, &suggested, &format)
    .await?
    .as_str()
    .map(str::to_string)
    .ok_or("导出已取消")?;
  // Result actions can only open a path granted by this window's completed export.
  state
    .document_exports
    .remember_export(&state.window_id, &result);
  report(app, &state.window_id, job.id, ExportStage::Done, 1, 1);
  let english = state
    .language
    .read()
    .is_ok_and(|language| *language == "en");
  let _ = state
    .notifications
    .finish_export(&state.metadata, english, Ok(json!(result)))
    .await;
  Ok(Some(result))
}
pub(super) async fn prepare_pages(
  state: &AppState,
  request: &Request,
  job: &Job,
  app: &AppHandle,
) -> Result<Vec<Page>, String> {
  if let Some(view) = &request.view {
    crate::export_image::validate_svg_scene(&view.svg)?;
    return Ok(vec![view.clone()]);
  }
  if !request.format.needs_pages() {
    return Ok(Vec::new());
  }
  if request.content == ExportContent::Presentation {
    let workbook = request.workbook.clone();
    return state
      .compute
      .run(move || crate::document_exports::presentation::pages(&workbook))
      .await;
  }
  let mut pages = Vec::new();
  let mut total = 0;
  for (index, id) in request.sheet_ids.iter().enumerate() {
    job.check()?;
    report(
      app,
      &state.window_id,
      job.id,
      ExportStage::Rendering,
      index,
      request.sheet_ids.len(),
    );
    if request.topic_ids.is_empty() && !request.drawing_ids.is_empty() {
      let document = request.workbook["sheets"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|sheet| sheet["id"] == *id)
        .map(|sheet| &sheet["document"])
        .ok_or("画布不存在")?;
      pages.push(crate::document_exports::ink::render(
        document,
        request.geometry.get(id).ok_or("缺少笔迹几何")?,
      )?);
      continue;
    }
    let scene = state
      .compute
      .render(
        request.workbook.clone(),
        id.clone(),
        request.include_collapsed,
        request.geometry.get(id).cloned(),
      )
      .await?;
    total += scene.svg.len();
    if total > 64 * 1024 * 1024 {
      return Err("导出图形超过 64 MiB 限制".into());
    }
    let title = request.workbook["sheets"]
      .as_array()
      .into_iter()
      .flatten()
      .find(|sheet| sheet["id"] == *id)
      .and_then(|sheet| sheet["name"].as_str())
      .unwrap_or("Sheet")
      .to_string();
    pages.push(Page {
      title,
      svg: scene.svg.clone(),
      width: scene.width,
      height: scene.height,
    });
  }
  Ok(pages)
}
pub(super) fn remove_background(page: &mut Page) -> Result<(), String> {
  let document = resvg::usvg::roxmltree::Document::parse(&page.svg).map_err(|_| "导出 SVG 无效")?;
  if let Some(rect) = document
    .root_element()
    .children()
    .find(|node| node.has_tag_name("rect"))
  {
    let range = rect.range();
    page.svg.replace_range(range, "");
  }
  Ok(())
}
pub(super) fn report(
  app: &AppHandle,
  owner: &str,
  job_id: uuid::Uuid,
  stage: ExportStage,
  completed: usize,
  total: usize,
) {
  let _ = app.emit_to(
    owner,
    "native:document-export-progress",
    Progress {
      job_id,
      stage,
      completed: completed.min(u32::MAX as usize) as u32,
      total: total.min(u32::MAX as usize) as u32,
    },
  );
}
