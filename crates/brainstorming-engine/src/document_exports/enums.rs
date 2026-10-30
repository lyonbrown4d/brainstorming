use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
  Png,
  Jpg,
  Webp,
  Svg,
  Pdf,
  Pptx,
  Docx,
  Html,
  Md,
  Opml,
  Txt,
  Xmind,
  Csv,
  Json,
}
impl ExportFormat {
  pub fn is_image(self) -> bool {
    matches!(self, Self::Png | Self::Jpg | Self::Webp | Self::Svg)
  }
  pub fn needs_pages(self) -> bool {
    self.is_image() || matches!(self, Self::Pdf | Self::Html)
  }
  pub fn is_outline(self) -> bool {
    matches!(self, Self::Md | Self::Opml | Self::Txt | Self::Xmind)
  }
  pub fn supports_presentation(self) -> bool {
    self.needs_pages() || self == Self::Pptx
  }
  pub fn supports_view(self) -> bool {
    matches!(self, Self::Png | Self::Jpg | Self::Webp | Self::Pdf)
  }
  pub fn needs_assets(self) -> bool {
    !matches!(
      self,
      Self::Md | Self::Opml | Self::Txt | Self::Csv | Self::Json
    )
  }
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Png => "png",
      Self::Jpg => "jpg",
      Self::Webp => "webp",
      Self::Svg => "svg",
      Self::Pdf => "pdf",
      Self::Pptx => "pptx",
      Self::Docx => "docx",
      Self::Html => "html",
      Self::Md => "md",
      Self::Opml => "opml",
      Self::Txt => "txt",
      Self::Xmind => "xmind",
      Self::Csv => "csv",
      Self::Json => "json",
    }
  }
}
impl std::fmt::Display for ExportFormat {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    formatter.write_str(self.as_str())
  }
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExportScope {
  #[default]
  Current,
  All,
  Sheets,
  Topics,
  Branch,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExportContent {
  #[default]
  Map,
  Presentation,
  View,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExportStage {
  Queued,
  Preparing,
  Rendering,
  Choosing,
  Encoding,
  Writing,
  Done,
}
