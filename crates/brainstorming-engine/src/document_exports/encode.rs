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
  let mut output = ImageOutput::new(request, pages.len())?;
  for (index, page) in pages.iter().enumerate() {
    check()?;
    output.push(index, page, image(request, page)?)?;
  }
  check()?;
  output.finish()
}

/// Ordered, bounded collector shared by sequential references and parallel workers.
pub(crate) struct ImageOutput {
  archive: Option<ZipWriter<Cursor<Vec<u8>>>>,
  single: Vec<u8>,
  total: usize,
  format: super::ExportFormat,
}
impl ImageOutput {
  pub fn new(request: &Request, count: usize) -> Result<Self> {
    if count == 0 || count > 128 {
      return Err("导出页面数量无效".into());
    }
    Ok(Self {
      archive: (count > 1).then(|| ZipWriter::new(Cursor::new(Vec::new()))),
      single: Vec::new(),
      total: 0,
      format: request.format,
    })
  }
  pub fn push(&mut self, index: usize, page: &Page, bytes: Vec<u8>) -> Result<()> {
    self.total += bytes.len();
    if self.total > 128 * 1024 * 1024 {
      return Err("批量导出超过 128 MiB 限制，请分批导出".into());
    }
    if let Some(archive) = &mut self.archive {
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
            self.format
          ),
          SimpleFileOptions::default(),
        )
        .map_err(|_| "无法创建批量导出文件")?;
      archive.write_all(&bytes).map_err(|_| "批量导出写入失败")?;
    } else {
      self.single = bytes;
    }
    Ok(())
  }
  pub fn finish(self) -> Result<Vec<u8>> {
    match self.archive {
      Some(archive) => archive
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|_| "批量导出打包失败".into()),
      None => Ok(self.single),
    }
  }
}

pub(crate) fn image(request: &Request, page: &Page) -> Result<Vec<u8>> {
  crate::export_image::encode_scene(image_request(request, page)?)
}

pub(crate) fn image_pixels(request: &Request, page: &Page) -> Result<u32> {
  let (width, height) = image_request(request, page)?.validate()?;
  Ok(if request.format == super::ExportFormat::Svg {
    1
  } else {
    width * height
  })
}

fn image_request(request: &Request, page: &Page) -> Result<crate::export_image::Request> {
  let format = match request.format {
    super::ExportFormat::Png => crate::export_image::Format::Png,
    super::ExportFormat::Jpg => crate::export_image::Format::Jpg,
    super::ExportFormat::Webp => crate::export_image::Format::Webp,
    super::ExportFormat::Svg => crate::export_image::Format::Svg,
    _ => return Err("图片格式无效".into()),
  };
  let scale = if request.width.is_some() || request.height.is_some() {
    Some(
      request
        .width
        .map(|w| w as f64 / page.width)
        .unwrap_or(f64::INFINITY)
        .min(
          request
            .height
            .map(|h| h as f64 / page.height)
            .unwrap_or(f64::INFINITY),
        ),
    )
  } else {
    request.scale
  };
  Ok(crate::export_image::Request {
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
