use super::content::{bounded, ordered_topics, picture, safe_link, text};
use docx_rs::{Docx, Hyperlink, HyperlinkType, Paragraph, Pic, Run, Style, StyleType};
use serde_json::Value;
use std::io::Cursor;

pub(super) fn encode(workbook: &Value) -> Result<Vec<u8>, String> {
  let mut doc = Docx::new().default_size(22).add_style(
    Style::new("Title", StyleType::Paragraph)
      .name("Title")
      .size(48)
      .bold(),
  );
  for level in 1..=9 {
    doc = doc.add_style(
      Style::new(format!("Heading{level}"), StyleType::Paragraph)
        .name(format!("heading {level}"))
        .based_on("Normal")
        .next("Normal")
        .outline_lvl(level - 1)
        .bold()
        .size(36usize.saturating_sub(level * 2).max(22)),
    );
  }
  doc = doc.add_paragraph(
    Paragraph::new()
      .style("Title")
      .add_run(Run::new().add_text(text(workbook, "title"))),
  );
  let mut resource_bytes = 0usize;
  let mut decoded_bytes = 0usize;
  let mut text_bytes = text(workbook, "title").len();
  let mut paragraphs = 1usize;
  for sheet in workbook["sheets"].as_array().ok_or("导出缺少画布")? {
    text_bytes += text(sheet, "name").len();
    paragraphs += 1;
    doc = doc.add_paragraph(
      Paragraph::new()
        .style("Heading1")
        .add_run(Run::new().add_text(text(sheet, "name"))),
    );
    let document = &sheet["document"];
    for (topic, depth) in ordered_topics(document)? {
      text_bytes =
        text_bytes.saturating_add(text(topic, "title").len() + text(topic, "notes").len());
      paragraphs += 3
        + text(topic, "notes")
          .bytes()
          .filter(|byte| *byte == b'\n')
          .count();
      if text_bytes > 8 * 1024 * 1024 || paragraphs > 100_000 {
        return Err("Word 内容超过 8 MiB 或 100000 段限制".into());
      }
      let level = (depth + 2).min(9);
      doc = doc.add_paragraph(
        Paragraph::new()
          .style(&format!("Heading{level}"))
          .keep_next(true)
          .add_run(Run::new().add_text(text(topic, "title"))),
      );
      if !text(topic, "notes").is_empty() {
        for line in text(topic, "notes").split('\n') {
          doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text(line)));
        }
      }
      if let Some(url) = safe_link(topic) {
        doc = doc.add_paragraph(Paragraph::new().add_hyperlink(
          Hyperlink::new(&url, HyperlinkType::External).add_run(Run::new().add_text(&url)),
        ));
      }
      if let Some(image) = picture(document, topic)? {
        resource_bytes = resource_bytes.saturating_add(image.png.len());
        decoded_bytes += image.width as usize * image.height as usize * 4;
        if resource_bytes > 24 * 1024 * 1024 || decoded_bytes > 24 * 1024 * 1024 {
          return Err("Word 图片总量超过 24 MiB 限制".into());
        }
        let scale = (560. / f64::from(image.width)).min(1.);
        let pic = Pic::new_with_dimensions(image.png.clone(), image.width, image.height).size(
          (f64::from(image.width) * scale * 9525.) as u32,
          (f64::from(image.height) * scale * 9525.) as u32,
        );
        doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_image(pic)));
      }
    }
  }
  let mut buffer = Cursor::new(Vec::new());
  doc
    .build()
    .pack(&mut buffer)
    .map_err(|_| "Word 文档编码失败")?;
  bounded(buffer.into_inner())
}
