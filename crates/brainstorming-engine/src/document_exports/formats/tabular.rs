use super::content::{MAX_BYTES, bounded, ordered_topics, safe_link, text};
use serde_json::Value;
use std::io::Write;

pub(super) fn csv(workbook: &Value) -> Result<Vec<u8>, String> {
  let mut writer = csv::WriterBuilder::new()
    .terminator(csv::Terminator::CRLF)
    .from_writer(Vec::new());
  writer
    .write_record([
      "Sheet",
      "Topic ID",
      "Parent ID",
      "Depth",
      "Title",
      "Notes",
      "URL",
    ])
    .map_err(|_| "CSV 编码失败")?;
  for sheet in workbook["sheets"].as_array().ok_or("导出缺少画布")? {
    let document = &sheet["document"];
    let mut parents = std::collections::HashMap::new();
    for (topic, _) in ordered_topics(document)? {
      for child in topic["children"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
      {
        parents.insert(child, text(topic, "id"));
      }
    }
    for (topic, depth) in ordered_topics(document)? {
      let values = [
        text(sheet, "name").to_owned(),
        text(topic, "id").to_owned(),
        parents
          .get(text(topic, "id"))
          .copied()
          .unwrap_or("")
          .to_owned(),
        depth.to_string(),
        text(topic, "title").to_owned(),
        text(topic, "notes").to_owned(),
        safe_link(topic).unwrap_or_default(),
      ];
      writer
        .write_record(values.iter().map(|value| neutralize_formula(value)))
        .map_err(|_| "CSV 编码失败")?;
      if writer.get_ref().len() > MAX_BYTES {
        return Err("CSV 内容超过 128 MiB 限制".into());
      }
    }
  }
  bounded(writer.into_inner().map_err(|_| "CSV 写入失败")?)
}

fn neutralize_formula(value: &str) -> String {
  if value
    .trim_start_matches(|ch: char| ch.is_whitespace() || ch.is_control())
    .starts_with(['=', '+', '-', '@'])
    || value.starts_with(['\t', '\r', '\n'])
  {
    format!("'{value}")
  } else {
    value.into()
  }
}

struct LimitedWriter(Vec<u8>);
impl Write for LimitedWriter {
  fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
    if self.0.len().saturating_add(bytes.len()) > MAX_BYTES {
      return Err(std::io::Error::other("JSON 导出超过 128 MiB 限制"));
    }
    self.0.extend_from_slice(bytes);
    Ok(bytes.len())
  }
  fn flush(&mut self) -> std::io::Result<()> {
    Ok(())
  }
}

pub(super) fn json(workbook: &Value) -> Result<Vec<u8>, String> {
  #[derive(serde::Serialize)]
  struct Envelope<'a> {
    format: &'static str,
    version: u8,
    workbook: &'a Value,
  }
  let envelope = Envelope {
    format: "brainstorming.export",
    version: 1,
    workbook,
  };
  let mut writer = LimitedWriter(Vec::new());
  serde_json::to_writer_pretty(&mut writer, &envelope)
    .map_err(|_| "JSON 导出失败或超过容量限制")?;
  Ok(writer.0)
}
