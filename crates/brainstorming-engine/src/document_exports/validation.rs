use super::{ExportContent, ExportFormat, Request, Result};
impl Request {
  pub fn validate(&self) -> Result<()> {
    if self.content == ExportContent::Presentation && !self.format.supports_presentation() {
      return Err("此格式不支持演示页面".into());
    }
    if self.view.is_some() && !self.format.supports_view() {
      return Err("当前视角仅支持图片和 PDF".into());
    }
    if (self.content == ExportContent::View) != self.view.is_some() {
      return Err("请重新截取当前视角后导出".into());
    }
    if self.format == ExportFormat::Pptx && self.content != ExportContent::Presentation {
      return Err("PowerPoint 导出需要选择演示页面".into());
    }
    if serde_json::to_vec(self).map_err(|_| "导出内容无效")?.len() > 64 * 1024 * 1024 {
      return Err("导出内容超过 64 MiB 限制，请分批导出".into());
    }
    if self.geometry.len() > 128
      || self.width.is_some_and(|v| v == 0 || v > 16384)
      || self.height.is_some_and(|v| v == 0 || v > 16384)
      || self
        .scale
        .is_some_and(|v| !v.is_finite() || v <= 0.0 || v > 8.0)
      || self.jpeg_quality.is_some_and(|v| v == 0 || v > 100)
      || (self.jpeg_quality.is_some() && self.format != ExportFormat::Jpg)
    {
      return Err("导出尺寸或质量无效".into());
    }
    Ok(())
  }
}
