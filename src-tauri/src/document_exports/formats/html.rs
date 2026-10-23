use super::content::{MAX_BYTES, bounded, escape, ordered_topics, safe_link, text};
use crate::document_exports::Page;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::Value;

pub(super) fn encode(
  workbook: &Value,
  pages: &[Page],
  presentation: bool,
) -> Result<Vec<u8>, String> {
  let mut html = format!(
    "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\"><title>{}</title><style>body{{margin:0;background:#f7f7f2;color:#242731;font:16px system-ui,sans-serif}}header,nav,main{{max-width:1200px;margin:auto;padding:20px}}nav a{{display:inline-block;margin:6px}}section{{margin-bottom:40px;scroll-margin-top:16px}}img{{width:100%;height:auto;background:white}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}details{{margin-top:20px}}.topic{{margin-block:14px;padding-left:16px;border-left:2px solid #bbb}}@media print{{nav,details{{display:none}}section{{break-after:page;margin:0}}header{{display:none}}}}</style></head><body><header><h1>{}</h1><p>{}</p></header><nav aria-label=\"Pages\">",
    escape(text(workbook, "title")),
    escape(text(workbook, "title")),
    if presentation {
      "Presentation"
    } else {
      "Mind map"
    }
  );
  let mut total_svg = 0usize;
  for (index, page) in pages.iter().enumerate() {
    total_svg = total_svg.saturating_add(page.svg.len());
    if total_svg > MAX_BYTES / 2 {
      return Err("HTML 图形超过 64 MiB 限制".into());
    }
    html.push_str(&format!(
      "<a href=\"#page-{}\">{} · {}</a>",
      index + 1,
      index + 1,
      escape(&page.title)
    ));
  }
  html.push_str("</nav><main>");
  for (index, page) in pages.iter().enumerate() {
    // SVG loaded in an image context cannot execute scripts or access the host document.
    html.push_str(&format!("<section id=\"page-{}\"><h2>{}</h2><img alt=\"{}\" src=\"data:image/svg+xml;base64,{}\"></section>",
      index+1,escape(&page.title),escape(&page.title),STANDARD.encode(page.svg.as_bytes())));
  }
  html.push_str("<details><summary>Text, notes and links</summary>");
  for sheet in workbook["sheets"].as_array().ok_or("导出缺少画布")? {
    html.push_str(&format!("<h2>{}</h2>", escape(text(sheet, "name"))));
    for (topic, _) in ordered_topics(&sheet["document"])? {
      html.push_str(&format!(
        "<div class=\"topic\"><h3>{}</h3><pre>{}</pre>",
        escape(text(topic, "title")),
        escape(text(topic, "notes"))
      ));
      if let Some(url) = safe_link(topic) {
        html.push_str(&format!(
          "<a rel=\"noreferrer noopener\" href=\"{}\">{}</a>",
          escape(&url),
          escape(&url)
        ));
      }
      html.push_str("</div>");
      if html.len() > MAX_BYTES {
        return Err("HTML 内容超过 128 MiB 限制".into());
      }
    }
    for step in sheet["document"]["presentation"]
      .as_array()
      .into_iter()
      .flatten()
    {
      if step["hidden"] != true && !text(step, "notes").is_empty() {
        html.push_str(&format!("<pre>{}</pre>", escape(text(step, "notes"))));
      }
    }
  }
  html.push_str("</details></main></body></html>");
  bounded(html.into_bytes())
}
