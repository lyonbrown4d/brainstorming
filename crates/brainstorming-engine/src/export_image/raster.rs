use super::{Format, Reporter, Request, Result, Stage, validation};
use image::{
  ExtendedColorType, ImageEncoder,
  codecs::{jpeg::JpegEncoder, png::PngEncoder, webp::WebPEncoder},
};
use resvg::{tiny_skia, usvg};
use std::sync::Arc;

pub(super) fn fonts() -> Arc<usvg::fontdb::Database> {
  let mut database = usvg::fontdb::Database::new();
  database.load_system_fonts();
  // fontdb deliberately leaves Android discovery to its caller.
  #[cfg(target_os = "android")]
  for directory in ["/system/fonts", "/product/fonts", "/system_ext/fonts"] {
    database.load_fonts_dir(directory);
  }
  for family in [
    "PingFang SC",
    "Noto Sans CJK SC",
    "Microsoft YaHei",
    "WenQuanYi Zen Hei",
    "Arial",
  ] {
    if database
      .faces()
      .any(|face| face.families.iter().any(|(name, _)| name == family))
    {
      database.set_sans_serif_family(family);
      break;
    }
  }
  Arc::new(database)
}
pub(super) fn render(
  request: Request,
  fonts: Arc<usvg::fontdb::Database>,
  report: Reporter,
) -> Result<Vec<u8>> {
  let (width, height) = request.validate()?;
  report(Stage::Rendering);
  validation::scene(&request)?;
  let options = usvg::Options {
    fontdb: fonts,
    font_family: "sans-serif".into(),
    languages: vec!["zh-CN".into(), "en".into()],
    image_href_resolver: usvg::ImageHrefResolver {
      // The XML validator already checked byte, type and dimension limits.
      resolve_data: Box::new(|mime, data, _| match mime {
        "image/png" => Some(usvg::ImageKind::PNG(data)),
        "image/jpeg" | "image/jpg" => Some(usvg::ImageKind::JPEG(data)),
        "image/webp" => Some(usvg::ImageKind::WEBP(data)),
        "image/gif" => Some(usvg::ImageKind::GIF(data)),
        _ => None,
      }),
      // Never let the renderer open a path, even if validation is changed later.
      resolve_string: Box::new(|_, _| None),
    },
    ..Default::default()
  };
  let tree = usvg::Tree::from_str(&request.svg, &options).map_err(|_| "导出 SVG 无法解析")?;
  if (f64::from(tree.size().width()) - request.width).abs() > 0.01
    || (f64::from(tree.size().height()) - request.height).abs() > 0.01
  {
    return Err("导出 SVG 尺寸与请求不一致".into());
  }
  if request.format == Format::Svg {
    return Ok(request.svg.into_bytes());
  }
  let mut pixmap = tiny_skia::Pixmap::new(width, height).ok_or("无法分配导出图片内存")?;
  if request.format == Format::Jpg {
    pixmap.fill(tiny_skia::Color::WHITE);
  }
  resvg::render(
    &tree,
    tiny_skia::Transform::from_scale(
      width as f32 / tree.size().width(),
      height as f32 / tree.size().height(),
    ),
    &mut pixmap.as_mut(),
  );
  report(Stage::Encoding);
  // tiny-skia pixels are premultiplied; image encoders require straight alpha.
  for pixel in pixmap.data_mut().as_chunks_mut::<4>().0.iter_mut() {
    let alpha = u32::from(pixel[3]);
    if alpha > 0 && alpha < 255 {
      for channel in &mut pixel[..3] {
        *channel = ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8;
      }
    }
  }
  let mut bytes = Vec::new();
  match request.format {
    Format::Png => PngEncoder::new(&mut bytes).write_image(
      pixmap.data(),
      width,
      height,
      ExtendedColorType::Rgba8,
    ),
    Format::Webp => WebPEncoder::new_lossless(&mut bytes).write_image(
      pixmap.data(),
      width,
      height,
      ExtendedColorType::Rgba8,
    ),
    Format::Jpg => {
      let rgb: Vec<u8> = pixmap
        .data()
        .as_chunks::<4>()
        .0
        .iter()
        .flat_map(|pixel| pixel[..3].iter().copied())
        .collect();
      JpegEncoder::new_with_quality(&mut bytes, request.quality.unwrap_or(92)).encode(
        &rgb,
        width,
        height,
        ExtendedColorType::Rgb8,
      )
    }
    Format::Svg => unreachable!(),
  }
  .map_err(|_| "导出图片编码失败")?;
  Ok(bytes)
}
