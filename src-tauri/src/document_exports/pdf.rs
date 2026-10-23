#[path = "pdf_fonts.rs"]
mod fonts;
use super::Page;
use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use svg2pdf::usvg;

const POINTS_PER_PIXEL: f64 = 72.0 / 96.0;
const POINTS_PER_MM: f64 = 72.0 / 25.4;
const MAX_PAGES: usize = 128;
const MAX_SVG_BYTES: usize = 64 * 1024 * 1024;
const MAX_PDF_BYTES: usize = 128 * 1024 * 1024;
const MAX_PDF_SIDE: f64 = 14_400.0;
const SVG_NAME: Name<'static> = Name(b"S1");

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Paper {
  #[default]
  Auto,
  A4,
  A3,
  Letter,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
  #[default]
  Auto,
  Portrait,
  Landscape,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct PdfOptions {
  pub paper: Paper,
  pub orientation: Orientation,
  pub margin_mm: f64,
  pub paginate: bool,
}

impl Default for PdfOptions {
  fn default() -> Self {
    Self {
      paper: Paper::Auto,
      orientation: Orientation::Auto,
      margin_mm: 12.0,
      paginate: false,
    }
  }
}

#[derive(Clone, Copy)]
struct Placement {
  width: f64,
  height: f64,
  content_width: f64,
  content_height: f64,
  x: f64,
  y: f64,
  tiled: bool,
}

pub fn encode(pages: &[Page], options: &PdfOptions) -> Result<Vec<u8>, String> {
  encode_cancellable(pages, options, &|| Ok(()))
}
pub fn encode_cancellable(
  pages: &[Page],
  options: &PdfOptions,
  check: &dyn Fn() -> Result<(), String>,
) -> Result<Vec<u8>, String> {
  check()?;
  validate(pages, options)?;
  let margin = options.margin_mm * POINTS_PER_MM;
  let layouts: Vec<Vec<Placement>> = pages
    .iter()
    .map(|page| layout(page, options, margin))
    .collect::<Result<_, _>>()?;
  if layouts.iter().map(Vec::len).sum::<usize>() > MAX_PAGES {
    return Err("PDF 页数超过 128 页限制".into());
  }

  let svg_options = usvg::Options {
    fontdb: fonts::database(),
    font_family: "sans-serif".into(),
    languages: vec!["zh-CN".into(), "en".into()],
    image_href_resolver: usvg::ImageHrefResolver {
      resolve_data: Box::new(|mime, data, _| match mime {
        "image/png" => Some(usvg::ImageKind::PNG(data)),
        "image/jpeg" | "image/jpg" => Some(usvg::ImageKind::JPEG(data)),
        "image/webp" => Some(usvg::ImageKind::WEBP(data)),
        "image/gif" => Some(usvg::ImageKind::GIF(data)),
        _ => None,
      }),
      resolve_string: Box::new(|_, _| None),
    },
    ..Default::default()
  };

  let mut pdf = Pdf::new();
  let mut next_ref = Ref::new(1);
  let catalog_id = next_ref.bump();
  let page_tree_id = next_ref.bump();
  let mut page_ids = Vec::with_capacity(layouts.iter().map(Vec::len).sum());
  for placements in &layouts {
    for _ in placements {
      page_ids.push(next_ref.bump());
    }
  }
  pdf.catalog(catalog_id).pages(page_tree_id);
  pdf
    .pages(page_tree_id)
    .kids(page_ids.iter().copied())
    .count(page_ids.len() as i32);

  let mut page_index = 0;
  for (source, placements) in pages.iter().zip(layouts.iter()) {
    check()?;
    crate::export_image::validate_svg_scene(&source.svg)?;
    let tree = usvg::Tree::from_str(&source.svg, &svg_options)
      .map_err(|_| "PDF 导出 SVG 无法解析".to_string())?;
    if (f64::from(tree.size().width()) - source.width).abs() > 0.01
      || (f64::from(tree.size().height()) - source.height).abs() > 0.01
    {
      return Err("PDF 导出 SVG 尺寸与请求不一致".into());
    }
    let (chunk, x_object_id) = svg2pdf::to_chunk(&tree, svg2pdf::ConversionOptions::default())
      .map_err(|error| format!("PDF 矢量编码失败: {error}"))?;
    let mut references = HashMap::new();
    let chunk = chunk.renumber(|old| *references.entry(old).or_insert_with(|| next_ref.bump()));
    let x_object_id = *references.get(&x_object_id).ok_or("PDF 图形引用无效")?;
    pdf.extend(&chunk);
    for placement in placements {
      let page_id = page_ids[page_index];
      page_index += 1;
      let content_id = next_ref.bump();
      let mut page = pdf.page(page_id);
      page.media_box(Rect::new(
        0.0,
        0.0,
        placement.width as f32,
        placement.height as f32,
      ));
      page.parent(page_tree_id);
      page.contents(content_id);
      page.resources().x_objects().pair(SVG_NAME, x_object_id);
      page.finish();

      let mut content = Content::new();
      content.save_state();
      if placement.tiled {
        content.rect(
          margin as f32,
          margin as f32,
          (placement.width - 2.0 * margin) as f32,
          (placement.height - 2.0 * margin) as f32,
        );
        content.clip_nonzero().end_path();
      }
      content.transform([
        placement.content_width as f32,
        0.0,
        0.0,
        placement.content_height as f32,
        placement.x as f32,
        placement.y as f32,
      ]);
      content.x_object(SVG_NAME).restore_state();
      pdf.stream(content_id, &content.finish());
    }
  }
  let bytes = pdf.finish();
  if bytes.len() > MAX_PDF_BYTES {
    return Err("PDF 文件超过 128 MiB 限制".into());
  }
  Ok(bytes)
}

fn validate(pages: &[Page], options: &PdfOptions) -> Result<(), String> {
  if pages.is_empty() || pages.len() > MAX_PAGES {
    return Err("PDF 必须包含 1 至 128 页".into());
  }
  if !options.margin_mm.is_finite() || !(0.0..=50.0).contains(&options.margin_mm) {
    return Err("PDF 页边距必须在 0 至 50 毫米之间".into());
  }
  let mut total_bytes = 0usize;
  for page in pages {
    total_bytes = total_bytes.saturating_add(page.svg.len());
    if page.svg.is_empty() || total_bytes > MAX_SVG_BYTES {
      return Err("PDF SVG 总量超过 64 MiB 限制".into());
    }
    if !page.width.is_finite()
      || !page.height.is_finite()
      || !(1.0..=16_384.0).contains(&page.width)
      || !(1.0..=16_384.0).contains(&page.height)
    {
      return Err("PDF 页面尺寸无效".into());
    }
  }
  Ok(())
}

fn layout(page: &Page, options: &PdfOptions, margin: f64) -> Result<Vec<Placement>, String> {
  let source_width = page.width * POINTS_PER_PIXEL;
  let source_height = page.height * POINTS_PER_PIXEL;
  let (width, height) = match options.paper {
    Paper::Auto => (source_width + 2.0 * margin, source_height + 2.0 * margin),
    Paper::A4 => (210.0 * POINTS_PER_MM, 297.0 * POINTS_PER_MM),
    Paper::A3 => (297.0 * POINTS_PER_MM, 420.0 * POINTS_PER_MM),
    Paper::Letter => (612.0, 792.0),
  };
  let landscape = match options.orientation {
    Orientation::Landscape => true,
    Orientation::Portrait => false,
    Orientation::Auto => source_width > source_height,
  };
  let (width, height) = if matches!(options.paper, Paper::Auto) {
    (width, height)
  } else if landscape {
    (height, width)
  } else {
    (width, height)
  };
  let usable_width = width - 2.0 * margin;
  let usable_height = height - 2.0 * margin;
  if width > MAX_PDF_SIDE || height > MAX_PDF_SIDE || usable_width < 1.0 || usable_height < 1.0 {
    return Err("PDF 纸张或页边距尺寸无效".into());
  }
  if !options.paginate || matches!(options.paper, Paper::Auto) {
    let scale = (usable_width / source_width).min(usable_height / source_height);
    let content_width = source_width * scale;
    let content_height = source_height * scale;
    return Ok(vec![Placement {
      width,
      height,
      content_width,
      content_height,
      x: (width - content_width) / 2.0,
      y: (height - content_height) / 2.0,
      tiled: false,
    }]);
  }
  let columns = (source_width / usable_width).ceil() as usize;
  let rows = (source_height / usable_height).ceil() as usize;
  if columns.saturating_mul(rows) > MAX_PAGES {
    return Err("PDF 分页超过 128 页限制".into());
  }
  let mut result = Vec::with_capacity(columns * rows);
  for row in 0..rows {
    for column in 0..columns {
      result.push(Placement {
        width,
        height,
        content_width: source_width,
        content_height: source_height,
        x: margin - column as f64 * usable_width,
        y: height - margin - source_height + row as f64 * usable_height,
        tiled: true,
      });
    }
  }
  Ok(result)
}

#[cfg(test)]
#[path = "pdf_tests.rs"]
mod tests;
