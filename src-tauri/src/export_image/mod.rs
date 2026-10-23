mod raster;
mod service;
#[cfg(test)]
mod tests;
mod validation;
mod validation_clips;
#[cfg(test)]
mod validation_tests;

use serde::{Deserialize, Serialize};
pub use service::{ExportLease, ImageExportService};
pub type Result<T> = std::result::Result<T, String>;
pub const MAX_DIMENSION: u32 = 16_384;
pub const MAX_PIXELS: u64 = 40_000_000;
pub const MAX_SVG_BYTES: usize = 40 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Format {
  Png,
  Jpg,
  Webp,
  Svg,
}
impl Format {
  pub fn extension(self) -> &'static str {
    match self {
      Self::Png => "png",
      Self::Jpg => "jpg",
      Self::Webp => "webp",
      Self::Svg => "svg",
    }
  }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
  pub job_id: uuid::Uuid,
  pub format: Format,
  pub suggested_name: String,
  pub svg: String,
  pub width: f64,
  pub height: f64,
  pub scale: Option<f64>,
  #[serde(rename = "jpegQuality")]
  pub quality: Option<u8>,
}
impl Request {
  /// This inexpensive boundary check runs before opening the native picker.
  pub fn validate(&self) -> Result<(u32, u32)> {
    if self.svg.len() > MAX_SVG_BYTES || self.svg.is_empty() {
      return Err("导出 SVG 超过 40 MiB 限制".into());
    }
    if self.suggested_name.is_empty() || self.suggested_name.len() > 4096 {
      return Err("导出文件名无效".into());
    }
    if !self.width.is_finite()
      || !self.height.is_finite()
      || self.width < 1.0
      || self.height < 1.0
      || self.width > 1_000_000.0
      || self.height > 1_000_000.0
    {
      return Err("导出尺寸无效".into());
    }
    if self
      .quality
      .is_some_and(|quality| quality == 0 || quality > 100)
      || (self.quality.is_some() && self.format != Format::Jpg)
    {
      return Err("导出质量无效".into());
    }
    let scale = self.scale.unwrap_or_else(|| {
      2.0_f64
        .min((MAX_DIMENSION - 1) as f64 / self.width)
        .min((MAX_DIMENSION - 1) as f64 / self.height)
        .min(((MAX_PIXELS - 32768) as f64 / (self.width * self.height)).sqrt())
    });
    if !scale.is_finite() || scale <= 0.0 || scale > 8.0 {
      return Err("导出缩放比例无效".into());
    }
    let width = (self.width * scale).ceil();
    let height = (self.height * scale).ceil();
    if width < 1.0
      || height < 1.0
      || width > MAX_DIMENSION as f64
      || height > MAX_DIMENSION as f64
      || width * height > MAX_PIXELS as f64
    {
      return Err("导出图片不能超过 16384 像素或 4000 万像素".into());
    }
    Ok((width as u32, height as u32))
  }
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
  Rendering,
  Encoding,
  Writing,
  Done,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
  pub job_id: uuid::Uuid,
  pub stage: Stage,
}
pub type Reporter = std::sync::Arc<dyn Fn(Stage) + Send + Sync>;

/// Validate self-contained native export geometry before any renderer parses it.
pub(crate) fn validate_svg_scene(svg: &str) -> Result<()> {
  if svg.is_empty() || svg.len() > MAX_SVG_BYTES {
    return Err("导出 SVG 超过大小限制".into());
  }
  validation::scene_svg(svg)
}

/// Shared native encoders run inside the document export service worker limit.
pub(crate) fn encode_scene(request: Request) -> Result<Vec<u8>> {
  static FONTS: std::sync::OnceLock<std::sync::Arc<resvg::usvg::fontdb::Database>> =
    std::sync::OnceLock::new();
  raster::render(
    request,
    FONTS.get_or_init(raster::fonts).clone(),
    std::sync::Arc::new(|_| {}),
  )
}
