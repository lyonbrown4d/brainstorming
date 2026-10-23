use super::{content::text, encode};
use crate::document_exports::{ExportFormat, presentation};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::io::{Cursor, Read};

fn fixture() -> Value {
  let mut png = Cursor::new(Vec::new());
  image::DynamicImage::new_rgb8(4, 2)
    .write_to(&mut png, image::ImageFormat::Png)
    .unwrap();
  let children: Vec<String> = (0..9).map(|index| format!("child{index}")).collect();
  let mut topics = serde_json::Map::new();
  topics.insert(
    "root".into(),
    json!({"id":"root","title":"Root","children":children,"notes":"Root notes"}),
  );
  for index in 0..9 {
    topics.insert(format!("child{index}"),json!({"id":format!("child{index}"),"title":format!("Item {index}"),"children":[],"notes":format!("Details {index}")}));
  }
  topics.get_mut("child1").unwrap()["image"] = json!({"assetId":"picture","width":4,"height":2});
  topics.get_mut("child1").unwrap()["metadata"] =
    json!({"link":{"kind":"url","url":"https://example.com/notes?a=1&b=2"}});
  json!({"title":"Export example","sheets":[{"id":"sheet","name":"Sheet A","document":{
    "rootId":"root","title":"Map title","topics":topics,
    "assets":{"picture":{"name":"image.png","mimeType":"image/png","data":STANDARD.encode(png.into_inner())}},
    "presentation":[{"topicId":"child1","layout":"image","notes":"Speaker notes"},
      {"topicId":"child0","hidden":true},
      {"topicId":"root","layout":"list","appearance":{"background":"#112233","title":{"color":"#aabbcc","bold":false,"align":"center"},"body":{"scale":1.5,"color":"#ddeeff","bold":true}}}]
  }}]})
}

fn entry(archive: &[u8], name: &str) -> Vec<u8> {
  let mut zip = zip::ZipArchive::new(Cursor::new(archive)).unwrap();
  let mut bytes = Vec::new();
  zip.by_name(name).unwrap().read_to_end(&mut bytes).unwrap();
  bytes
}
fn xml(archive: &[u8], name: &str) -> String {
  String::from_utf8(entry(archive, name)).unwrap()
}
fn all_entries(archive: &[u8], prefix: &str, suffix: &str) -> String {
  let mut zip = zip::ZipArchive::new(Cursor::new(archive)).unwrap();
  let mut text = String::new();
  for index in 0..zip.len() {
    let mut file = zip.by_index(index).unwrap();
    if file.name().unwrap().starts_with(prefix) && file.name().unwrap().ends_with(suffix) {
      file.read_to_string(&mut text).unwrap();
    }
  }
  text
}

#[test]
fn presentation_retains_order_hidden_styles_images_and_all_long_content() {
  let mut workbook = fixture();
  workbook["sheets"][0]["document"]["topics"]["child8"]["notes"] = json!(format!(
    "{}\nLASTDETAIL",
    "Long readable content ".repeat(150)
  ));
  let pages = presentation::pages(&workbook).unwrap();
  assert_eq!(pages[0].title, "Item 1");
  assert!(!pages.iter().any(|page| page.title == "Item 0"));
  assert!(pages.len() > 3);
  let svg = pages
    .iter()
    .map(|page| page.svg.as_str())
    .collect::<Vec<_>>()
    .join("");
  for index in 0..9 {
    assert!(svg.contains(&format!("Item {index}")));
  }
  assert!(svg.contains("LASTDETAIL"));
  assert!(svg.contains("#112233") && svg.contains("#aabbcc") && svg.contains("#ddeeff"));
  assert!(svg.contains("font-size=\"42\"") && svg.contains("text-anchor=\"middle\""));
  assert!(svg.contains("data:image/png;base64,") && svg.contains("Speaker notes"));
  assert!(
    pages
      .iter()
      .all(|page| page.width == 1280. && page.height == 720.)
  );
}

#[test]
fn office_packages_contain_editable_text_images_notes_and_relationships() {
  let workbook = fixture();
  let pptx = encode(&workbook, ExportFormat::Pptx, &[], true).unwrap();
  let slides = all_entries(&pptx, "ppt/slides/slide", ".xml");
  assert!(slides.contains("<a:t>Item 1</a:t>"));
  for index in 0..9 {
    assert!(slides.contains(&format!("Item {index}")));
  }
  assert!(slides.contains("sz=\"3200\"") && slides.contains("algn=\"ctr\""));
  assert!(xml(&pptx, "ppt/presentation.xml").contains("cx=\"12192000\" cy=\"6858000\""));
  assert!(xml(&pptx, "ppt/notesSlides/notesSlide1.xml").contains("Speaker notes"));
  assert!(xml(&pptx, "ppt/slides/_rels/slide1.xml.rels").contains("relationships/image"));
  let mut zip = zip::ZipArchive::new(Cursor::new(&pptx)).unwrap();
  let image_name = (0..zip.len())
    .find_map(|index| {
      let file = zip.by_index(index).unwrap();
      file
        .name()
        .unwrap()
        .starts_with("ppt/media/")
        .then(|| file.name().unwrap().into_owned())
    })
    .unwrap();
  assert!(entry(&pptx, &image_name).starts_with(b"\x89PNG"));
  let docx = encode(&workbook, ExportFormat::Docx, &[], false).unwrap();
  let document = xml(&docx, "word/document.xml");
  assert!(
    document.contains("<w:t xml:space=\"preserve\">Item 8</w:t>")
      || document.contains(">Item 8</w:t>")
  );
  assert!(document.contains("Details 8") && document.contains("Heading2"));
  assert!(xml(&docx, "word/styles.xml").contains("w:outlineLvl"));
  let rels = xml(&docx, "word/_rels/document.xml.rels");
  assert!(
    rels.contains("relationships/hyperlink")
      && rels.contains("https://example.com/notes?a=1&amp;b=2")
  );
  assert!(rels.contains("relationships/image"));
}

#[test]
fn csv_roundtrips_order_quotes_lines_and_neutralizes_formulas() {
  let mut workbook = fixture();
  workbook["sheets"][0]["document"]["topics"]["child0"]["title"] =
    json!(" \t=SUM(1,2)\n\"quoted\"");
  let bytes = encode(&workbook, ExportFormat::Csv, &[], false).unwrap();
  let mut reader = csv::Reader::from_reader(bytes.as_slice());
  assert_eq!(reader.headers().unwrap().len(), 7);
  let rows: Vec<_> = reader.records().map(Result::unwrap).collect();
  assert_eq!(&rows[0][4], "Root");
  assert_eq!(&rows[1][4], "' \t=SUM(1,2)\n\"quoted\"");
  assert_eq!(&rows[1][2], "root");
  assert_eq!(&rows[9][4], "Item 8");
}

#[test]
fn json_has_versioned_envelope_and_html_is_offline_and_escaped() {
  let mut workbook = fixture();
  workbook["title"] = json!("<script>alert('title')</script>");
  workbook["sheets"][0]["document"]["topics"]["child0"]["notes"] =
    json!("<img src=x onerror=alert(1)>");
  workbook["sheets"][0]["document"]["topics"]["child0"]["metadata"] =
    json!({"link":{"kind":"url","url":"javascript:alert(1)"}});
  let value: Value =
    serde_json::from_slice(&encode(&workbook, ExportFormat::Json, &[], false).unwrap()).unwrap();
  assert_eq!(value["format"], "brainstorming.export");
  assert_eq!(value["version"], 1);
  assert_eq!(value["workbook"], workbook);
  let pages = presentation::pages(&workbook).unwrap();
  let html =
    String::from_utf8(encode(&workbook, ExportFormat::Html, &pages, true).unwrap()).unwrap();
  assert!(
    !html.contains("<script>") && !html.contains("<img src=x") && !html.contains("javascript:")
  );
  assert!(html.contains("default-src 'none'") && html.contains("data:image/svg+xml;base64,"));
  assert!(html.contains("&lt;script&gt;") && html.contains("&lt;img src=x"));
  assert!(html.contains("href=\"#page-1\"") && html.contains("Speaker notes"));
}

#[test]
fn missing_hydrated_image_fails_before_package_creation() {
  let mut workbook = fixture();
  workbook["sheets"][0]["document"]["assets"]["picture"]
    .as_object_mut()
    .unwrap()
    .remove("data");
  assert!(
    presentation::pages(&workbook)
      .unwrap_err()
      .contains("尚未加载")
  );
  assert!(
    encode(&workbook, ExportFormat::Docx, &[], false)
      .unwrap_err()
      .contains("尚未加载")
  );
  assert_eq!(text(&workbook, "title"), "Export example");
}

#[test]
fn presentation_limits_repeated_steps_and_rejects_xml_controls() {
  let mut workbook = fixture();
  workbook["sheets"][0]["document"]["presentation"] = json!(vec![json!({"topicId":"child0"}); 129]);
  assert!(
    presentation::pages(&workbook)
      .unwrap_err()
      .contains("128 页")
  );
  workbook["sheets"][0]["document"]["presentation"] = json!([]);
  workbook["sheets"][0]["document"]["topics"]["root"]["title"] = json!("a\u{0000}b");
  assert!(
    encode(&workbook, ExportFormat::Pptx, &[], true)
      .unwrap_err()
      .contains("控制字符")
  );
}
