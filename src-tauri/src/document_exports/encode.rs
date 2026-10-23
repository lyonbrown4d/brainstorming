use super::{Page, Request, Result, formats, pdf};
use std::io::{Cursor, Write};
use zip::{ZipWriter, write::SimpleFileOptions};

pub fn extension(request: &Request, page_count: usize) -> &str {
  if page_count > 1 && request.format.is_image() {
    "zip"
  } else {
    request.format.as_str()
  }
}
pub fn pages(request: &Request, pages: &[Page]) -> Result<Vec<u8>> {
  pages_cancellable(request, pages, &|| Ok(()))
}
pub fn pages_cancellable(
  request: &Request,
  pages: &[Page],
  check: &dyn Fn() -> Result<()>,
) -> Result<Vec<u8>> {
  check()?;
  if request.format == super::ExportFormat::Pdf {
    return pdf::encode_cancellable(pages, &request.pdf, check);
  }
  if !request.format.is_image() {
    if request.format.is_outline() {
      return crate::interchange::export(&request.workbook, request.format.as_str(), None)
        .map(|result| result.bytes);
    }
    return formats::encode(
      &request.workbook,
      request.format,
      pages,
      request.content == super::ExportContent::Presentation,
    );
  }
  if pages.is_empty() || pages.len() > 128 {
    return Err("导出页面数量无效".into());
  }
  if pages.len() == 1 {
    return image(request, &pages[0]);
  }
  let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
  let mut total = 0;
  for (index, page) in pages.iter().enumerate() {
    check()?;
    let bytes = image(request, page)?;
    total += bytes.len();
    if total > 128 * 1024 * 1024 {
      return Err("批量导出超过 128 MiB 限制，请分批导出".into());
    }
    let title: String = page
      .title
      .chars()
      .map(|c| {
        if c.is_control() || "<>:\"/\\|?*".contains(c) {
          '_'
        } else {
          c
        }
      })
      .take(80)
      .collect();
    archive
      .start_file(
        format!(
          "{:03}-{}.{}",
          index + 1,
          title.trim_matches('.'),
          request.format
        ),
        SimpleFileOptions::default(),
      )
      .map_err(|_| "无法创建批量导出文件")?;
    archive.write_all(&bytes).map_err(|_| "批量导出写入失败")?;
  }
  check()?;
  archive
    .finish()
    .map(|cursor| cursor.into_inner())
    .map_err(|_| "批量导出打包失败".into())
}
fn image(request: &Request, page: &Page) -> Result<Vec<u8>> {
  let format = match request.format {
    super::ExportFormat::Png => crate::export_image::Format::Png,
    super::ExportFormat::Jpg => crate::export_image::Format::Jpg,
    super::ExportFormat::Webp => crate::export_image::Format::Webp,
    super::ExportFormat::Svg => crate::export_image::Format::Svg,
    _ => return Err("图片格式无效".into()),
  };
  let mut scale = request.scale;
  if request.width.is_some() || request.height.is_some() {
    let width = request
      .width
      .map(|value| value as f64 / page.width)
      .unwrap_or(f64::INFINITY);
    let height = request
      .height
      .map(|value| value as f64 / page.height)
      .unwrap_or(f64::INFINITY);
    scale = Some(width.min(height));
  }
  crate::export_image::encode_scene(crate::export_image::Request {
    job_id: request.job_id,
    format,
    suggested_name: page.title.clone(),
    svg: page.svg.clone(),
    width: page.width,
    height: page.height,
    scale,
    quality: request.jpeg_quality,
  })
}
