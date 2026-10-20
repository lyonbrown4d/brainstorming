//! Bounded, in-memory interchange with third-party mind-map and outline files.
mod archive;
mod outline;
mod outline_encode;
mod outline_model;
mod outline_txt;
mod xmind_assets;
mod xmind_export;
mod xmind_import;
mod xmind_import_fields;
mod xmind_import_topic;
mod xmind_legacy;
mod xmind_xml;

use serde_json::Value;

pub struct Imported {
  pub workbook: Value,
  pub warnings: Vec<String>,
}

pub struct Exported {
  pub bytes: Vec<u8>,
  pub suggested_name: String,
}

pub fn import(bytes: &[u8], name: &str) -> Result<Imported, String> {
  let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
  let result = match extension.as_str() {
    "xmind" => xmind_import::decode(bytes),
    "opml" | "mm" => outline::decode_opml(bytes),
    "md" | "markdown" => outline::decode_markdown(bytes),
    "txt" | "text" => outline_txt::decode(bytes),
    _ => Err("不支持此导入格式".into()),
  }?;
  crate::document::validate_workbook(&result.workbook).map_err(|error| error.to_string())?;
  Ok(result)
}

pub fn export(workbook: &Value, format: &str, sheet_id: Option<&str>) -> Result<Exported, String> {
  crate::document::validate_workbook(workbook).map_err(|error| error.to_string())?;
  let selected = select_sheets(workbook, sheet_id)?;
  let (bytes, extension) = match format.to_ascii_lowercase().as_str() {
    "xmind" => (xmind_export::encode(&selected)?, "xmind"),
    "opml" => (outline::encode_opml(&selected)?.into_bytes(), "opml"),
    "markdown" | "md" => (outline::encode_markdown(&selected).into_bytes(), "md"),
    "text" | "txt" => (outline::encode_text(&selected).into_bytes(), "txt"),
    _ => return Err("不支持此导出格式".into()),
  };
  Ok(Exported {
    bytes,
    suggested_name: format!("{}.{}", safe_file_stem(&selected["title"]), extension),
  })
}

pub(crate) fn select_sheets(workbook: &Value, sheet_id: Option<&str>) -> Result<Value, String> {
  let Some(sheet_id) = sheet_id else {
    return Ok(workbook.clone());
  };
  let mut selected = workbook.clone();
  let sheets = selected["sheets"].as_array_mut().ok_or("工作簿画布无效")?;
  let sheet = sheets
    .iter()
    .find(|sheet| sheet["id"] == sheet_id)
    .cloned()
    .ok_or("导出的画布不存在")?;
  *sheets = vec![sheet];
  let current_id = sheets[0]["id"].as_str().unwrap_or("").to_string();
  if let Some(topics) = sheets[0]["document"]["topics"].as_object_mut() {
    for topic in topics.values_mut() {
      let link = &topic["metadata"]["link"];
      if link["kind"] == "topic" && link["sheetId"].as_str().is_some_and(|id| id != current_id) {
        topic["metadata"]
          .as_object_mut()
          .and_then(|metadata| metadata.remove("link"));
      }
    }
  }
  Ok(selected)
}

fn safe_file_stem(title: &Value) -> String {
  let value = title.as_str().unwrap_or("导图");
  let cleaned: String = value
    .chars()
    .map(|ch| {
      if "\\/:*?\"<>|".contains(ch) || ch.is_control() {
        '_'
      } else {
        ch
      }
    })
    .take(80)
    .collect();
  let cleaned = cleaned.trim().trim_matches('.');
  if cleaned.is_empty() {
    "导图".into()
  } else {
    cleaned.into()
  }
}
