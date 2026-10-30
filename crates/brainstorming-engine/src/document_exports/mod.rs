pub mod assets;
mod enums;
pub mod formats;
pub mod pipeline;
mod validation;
pub use enums::{ExportContent, ExportFormat, ExportScope, ExportStage};
pub mod destination;
pub mod encode;
pub(crate) mod ink;
pub mod pdf;
pub mod presentation;
pub mod scope;
pub mod service;

use serde::{Deserialize, Serialize};
use serde_json::Value;
pub use service::DocumentExportService;
pub type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[serde(rename = "ExportPage")]
pub struct Page {
  pub title: String,
  pub svg: String,
  pub width: f64,
  pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[serde(rename = "DocumentExportInput")]
pub struct Request {
  #[specta(type = String)]
  pub job_id: uuid::Uuid,
  #[specta(type = crate::compute::wire::WireValue)]
  pub workbook: Value,
  #[serde(default)]
  pub geometry: std::collections::HashMap<String, crate::scene::VisualGeometry>,
  pub format: ExportFormat,
  #[serde(default)]
  pub scope: ExportScope,
  #[serde(default)]
  pub content: ExportContent,
  pub sheet_ids: Vec<String>,
  #[serde(default)]
  pub topic_ids: Vec<String>,
  #[serde(default)]
  pub drawing_ids: Vec<String>,
  #[serde(default)]
  pub include_collapsed: bool,
  #[serde(default)]
  pub transparent: bool,
  pub scale: Option<f64>,
  pub width: Option<u32>,
  pub height: Option<u32>,
  pub jpeg_quality: Option<u8>,
  #[serde(default)]
  pub pdf: pdf::PdfOptions,
  /// Present only for a captured, self-contained current spatial view.
  pub view: Option<Page>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(rename = "DocumentExportProgress")]
pub struct Progress {
  #[specta(type = String)]
  pub job_id: uuid::Uuid,
  pub stage: ExportStage,
  pub completed: u32,
  pub total: u32,
}

#[cfg(test)]
mod scope_tests;

#[cfg(test)]
mod service_tests;
