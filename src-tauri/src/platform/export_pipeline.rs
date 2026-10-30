use crate::{
  document_exports::{
    ExportFormat, ExportStage, Page, Progress, Request, encode, scope, service::Job,
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
  let pages = prepare_pages(&state, &request, &job, app).await?;
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
  let (job, bytes) =
    crate::document_exports::pipeline::encode(request, pages, job, state.compute.clone()).await?;
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
  let app = app.clone();
  let owner = state.window_id.clone();
  let id = job.id;
  let progress: crate::document_exports::pipeline::Reporter =
    Arc::new(move |stage, done, total| {
      report(&app, &owner, id, stage, done, total);
    });
  crate::document_exports::pipeline::prepare_pages(&state.compute, request, job, &progress).await
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
