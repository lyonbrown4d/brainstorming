use serde_json::Value;

pub fn encode_opml(workbook: &Value) -> Result<String, String> {
  let mut result = format!(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\" brainstorming=\"workbook-v1\"><head><title>{}</title></head><body>",
    xml(&workbook["title"])?
  );
  for sheet in workbook["sheets"].as_array().ok_or("画布格式无效")? {
    result.push_str(&format!("<outline text=\"{}\">", xml(&sheet["name"])?));
    write_opml_topic(
      sheet,
      sheet["document"]["rootId"].as_str().ok_or("中心主题无效")?,
      &mut result,
    )?;
    result.push_str("</outline>");
  }
  result.push_str("</body></opml>");
  Ok(result)
}
fn write_opml_topic(sheet: &Value, id: &str, output: &mut String) -> Result<(), String> {
  let topic = &sheet["document"]["topics"][id];
  output.push_str(&format!("<outline text=\"{}\"", xml(&topic["title"])?));
  if topic["notes"]
    .as_str()
    .is_some_and(|notes| !notes.is_empty())
  {
    output.push_str(&format!(" _note=\"{}\"", xml(&topic["notes"])?));
  }
  output.push('>');
  for child in topic["children"].as_array().ok_or("子主题无效")? {
    write_opml_topic(sheet, child.as_str().ok_or("子主题无效")?, output)?;
  }
  output.push_str("</outline>");
  Ok(())
}
fn xml(value: &Value) -> Result<String, String> {
  let source = value.as_str().ok_or("文本字段无效")?;
  if source.chars().any(|ch| {
    ((ch as u32) < 32 && !['\t', '\n', '\r'].contains(&ch))
      || ['\u{fffe}', '\u{ffff}'].contains(&ch)
  }) {
    return Err("文本包含 XML 无法表示的控制字符，请先删除这些字符".into());
  }
  Ok(
    source
      .replace('&', "&amp;")
      .replace('<', "&lt;")
      .replace('>', "&gt;")
      .replace('"', "&quot;")
      .replace('\'', "&apos;")
      .replace('\n', "&#10;")
      .replace('\r', "&#13;")
      .replace('\t', "&#9;"),
  )
}

pub fn encode_markdown(workbook: &Value) -> String {
  encode_lines(workbook, true)
}
pub fn encode_text(workbook: &Value) -> String {
  encode_lines(workbook, false)
}
fn encode_lines(workbook: &Value, markdown: bool) -> String {
  let mut sheets = Vec::new();
  for sheet in workbook["sheets"].as_array().into_iter().flatten() {
    let name = sheet["name"].as_str().unwrap_or("");
    let mut lines = vec![if markdown {
      format!("# {}", escape_md(&name.replace('\n', " ")))
    } else {
      name.into()
    }];
    if markdown {
      lines.push(String::new());
    }
    visit_lines(
      sheet,
      sheet["document"]["rootId"].as_str().unwrap_or(""),
      0,
      markdown,
      &mut lines,
    );
    sheets.push(lines.join("\n"));
  }
  format!("{}\n", sheets.join("\n\n"))
}
fn visit_lines(sheet: &Value, id: &str, depth: usize, markdown: bool, lines: &mut Vec<String>) {
  let topic = &sheet["document"]["topics"][id];
  let title = topic["title"].as_str().unwrap_or("");
  let indent = "  ".repeat(depth);
  if markdown {
    lines.push(format!(
      "{indent}- {}",
      escape_md(title).replace('\n', &format!("\\\n{indent}  "))
    ));
  } else {
    lines.push(format!("{indent}{}", title.replace('\n', "\\n")));
  }
  for child in topic["children"].as_array().into_iter().flatten() {
    visit_lines(
      sheet,
      child.as_str().unwrap_or(""),
      depth + 1,
      markdown,
      lines,
    );
  }
}
fn escape_md(value: &str) -> String {
  value
    .chars()
    .flat_map(|ch| {
      if "\\`*_[ ]<>#!|~+().&-".contains(ch) {
        vec!['\\', ch]
      } else {
        vec![ch]
      }
    })
    .collect()
}
