pub(crate) mod content;
mod docx;
mod html;
mod pptx;
mod tabular;

use crate::document_exports::{ExportFormat, Page};
use serde_json::Value;

pub(crate) fn encode(
  workbook: &Value,
  format: ExportFormat,
  pages: &[Page],
  presentation: bool,
) -> Result<Vec<u8>, String> {
  if matches!(format, ExportFormat::Pptx | ExportFormat::Docx) {
    content::xml_safe(workbook)?;
  }
  match format {
    ExportFormat::Pptx => pptx::encode(workbook),
    ExportFormat::Docx => docx::encode(workbook),
    ExportFormat::Html => html::encode(workbook, pages, presentation),
    ExportFormat::Csv => tabular::csv(workbook),
    ExportFormat::Json => tabular::json(workbook),
    _ => Err("不支持的文档导出格式".into()),
  }
}

#[cfg(test)]
mod tests;
