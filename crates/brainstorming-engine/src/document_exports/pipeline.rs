use super::{ExportContent, ExportStage, Page, Request, Result, encode, service::Job};
use crate::compute::ComputeService;
use futures_util::{StreamExt, stream};
use std::sync::Arc;

pub type Reporter = Arc<dyn Fn(ExportStage, usize, usize) + Send + Sync>;
const PARALLEL_PAGES: usize = 2;

/// Shared, ordered page production for desktop and headless callers.
pub async fn prepare_pages(
  compute: &ComputeService,
  request: &Request,
  job: &Job,
  report: &Reporter,
) -> Result<Vec<Page>> {
  let mut pages = if let Some(view) = &request.view {
    crate::export_image::validate_svg_scene(&view.svg)?;
    vec![view.clone()]
  } else if !request.format.needs_pages() {
    Vec::new()
  } else if request.content == ExportContent::Presentation {
    let workbook = request.workbook.clone();
    compute
      .run(move || super::presentation::pages(&workbook))
      .await?
  } else {
    report(ExportStage::Rendering, 0, request.sheet_ids.len());
    let mut workers = stream::iter(request.sheet_ids.iter())
      .map(|id| async move {
        job.check()?;
        render_page(compute, request, id).await
      })
      .buffered(PARALLEL_PAGES);
    let mut pages = Vec::new();
    let mut total = 0;
    let mut failure = None;
    while let Some(result) = workers.next().await {
      match result {
        Ok(page) if failure.is_none() => {
          total += page.svg.len();
          if total > 64 * 1024 * 1024 {
            failure = Some("导出图形超过 64 MiB 限制".into());
            job.token.cancel();
          } else {
            pages.push(page);
            report(ExportStage::Rendering, pages.len(), request.sheet_ids.len());
          }
        }
        Err(error) if failure.is_none() => {
          failure = Some(error);
          job.token.cancel();
        }
        _ => {}
      }
    }
    // Drain admitted workers before the caller can release its job lease.
    if let Some(error) = failure {
      return Err(error);
    }
    job.check()?;
    pages
  };
  if request.transparent && request.content != ExportContent::Presentation {
    for page in &mut pages {
      remove_background(page)?;
    }
  }
  Ok(pages)
}

async fn render_page(compute: &ComputeService, request: &Request, id: &str) -> Result<Page> {
  let sheet = request.workbook["sheets"]
    .as_array()
    .into_iter()
    .flatten()
    .find(|s| s["id"] == id)
    .ok_or("画布不存在")?;
  if request.topic_ids.is_empty() && !request.drawing_ids.is_empty() {
    let document = sheet["document"].clone();
    return compute
      .run(move || super::ink::render(&document, &crate::scene::prepare_geometry(&document)?))
      .await;
  }
  // Screen geometry is not an export contract: both entry points use native geometry.
  let scene = compute
    .render(
      request.workbook.clone(),
      id.to_owned(),
      request.include_collapsed,
      None,
    )
    .await?;
  Ok(Page {
    title: sheet["name"].as_str().unwrap_or("Sheet").into(),
    svg: scene.svg.clone(),
    width: scene.width,
    height: scene.height,
  })
}

fn remove_background(page: &mut Page) -> Result<()> {
  let document = resvg::usvg::roxmltree::Document::parse(&page.svg).map_err(|_| "导出 SVG 无效")?;
  if let Some(rect) = document
    .root_element()
    .children()
    .find(|node| node.has_tag_name("rect"))
  {
    page.svg.replace_range(rect.range(), "");
  }
  Ok(())
}

/// A detached owner retains admission until every blocking encoder drains.
pub async fn encode(
  request: Request,
  pages: Vec<Page>,
  job: Job,
  compute: Arc<ComputeService>,
) -> Result<(Job, Vec<u8>)> {
  tokio::spawn(async move {
    if !request.format.is_image() {
      return tokio::task::spawn_blocking(move || {
        job.check()?;
        let bytes = encode::pages_cancellable(&request, &pages, &|| job.check())?;
        if bytes.len() > 128 * 1024 * 1024 {
          return Err("导出文件超过 128 MiB 限制".into());
        }
        job.check()?;
        Ok((job, bytes))
      })
      .await
      .map_err(|_| "导出编码任务失败")?;
    }
    let request = Arc::new(request);
    let mut output = encode::ImageOutput::new(&request, pages.len())?;
    // A shared 40M-pixel budget also bounds two concurrently encoded pages.
    let pixels = Arc::new(tokio::sync::Semaphore::new(
      crate::export_image::MAX_PIXELS as usize,
    ));
    let mut workers = stream::iter(pages.into_iter().enumerate())
      .map(|(index, page)| {
        let request = request.clone();
        let compute = compute.clone();
        let pixels = pixels.clone();
        let token = job.token.clone();
        async move {
          if token.is_cancelled() {
            return Err("导出已取消".into());
          }
          let count = encode::image_pixels(&request, &page)?;
          let permit = tokio::select! {
            _=token.cancelled()=>return Err("导出已取消".into()),
            permit=pixels.acquire_many_owned(count)=>permit.map_err(|_|"导出服务已关闭")?,
          };
          compute
            .run(move || {
              let _permit = permit;
              if token.is_cancelled() {
                return Err("导出已取消".into());
              }
              let bytes = encode::image(&request, &page)?;
              if token.is_cancelled() {
                return Err("导出已取消".into());
              }
              Ok((index, page, bytes))
            })
            .await
        }
      })
      .buffered(PARALLEL_PAGES);
    let mut failure = None;
    while let Some(result) = workers.next().await {
      let result = result.and_then(|(index, page, bytes)| output.push(index, &page, bytes));
      if let Err(error) = result {
        if failure.is_none() {
          failure = Some(error);
          job.token.cancel();
        }
      }
    }
    drop(workers);
    if let Some(error) = failure {
      return Err(error);
    }
    job.check()?;
    Ok((job, output.finish()?))
  })
  .await
  .map_err(|_| "导出编码任务失败")?
}
