use brainstorming_native::interchange;
use serde_json::{Value, json};
use std::io::{Cursor, Write};
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

fn archive(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
  let mut output = Cursor::new(Vec::new());
  {
    let mut writer = ZipWriter::new(&mut output);
    for (name, data) in entries {
      writer
        .start_file(
          *name,
          SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
        )
        .unwrap();
      writer.write_all(data).unwrap();
    }
    writer.finish().unwrap();
  }
  output.into_inner()
}

fn modern(sheets: Value) -> Vec<u8> {
  archive(&[("content.json", serde_json::to_vec(&sheets).unwrap())])
}

fn workbook() -> Value {
  json!({"format":"brainstorming","version":2,"id":"book","title":"原始标题","sheets":[
    {"id":"first","name":"第一页","document":{"format":"brainstorming","version":1,"id":"first",
      "title":"中心","rootId":"root","topics":{
        "root":{"id":"root","title":"中心","children":["source","child"],"collapsed":false,"side":"right",
          "metadata":{"task":{"priority":2}},"style":{"width":240,"scale":1.5,"spatialDepth":125,"fill":"#112233"}},
        "source":{"id":"source","title":"范围","children":[],"collapsed":false,"side":"right"},
        "child":{"id":"child","title":"分支","children":[],"collapsed":false,"side":"left",
          "notes":"# Markdown\n正文","attachments":["asset"]}
      },"assets":{"asset":{"id":"asset","name":"资料.bin","mimeType":"application/octet-stream","data":"AP8B"}},
      "settings":{"layout":"logic-right","spatial":{"mode":"3d","yaw":0.4,"pitch":-0.2,"spacing":75}},
      "groups":[{"id":"range","kind":"summary","topicIds":["source"],"summaryTopicId":"child"}]
    }},
    {"id":"second","name":"第二页","document":{"format":"brainstorming","version":1,"id":"second",
      "title":"次中心","rootId":"other","topics":{"other":{"id":"other","title":"次中心","children":[],"collapsed":false,"side":"right"}}}}
  ]})
}

#[test]
fn modern_and_legacy_xmind_import_preserve_sheets_and_structure() {
  let modern = modern(json!([
    {"id":"sheet-a","title":"中文计划","rootTopic":{"id":"root","title":"中心","children":{"attached":[
      {"id":"child","title":"分支","branch":"folded","markers":[{"markerId":"priority-9"}]}]}}},
    {"id":"sheet-b","title":"第二页","rootTopic":{"id":"other","title":"次中心"}}
  ]));
  let imported = interchange::import(&modern, "sample.xmind").unwrap();
  assert_eq!(
    imported.workbook["sheets"][0]["document"]["topics"]["child"]["metadata"]["task"]["priority"],
    9
  );
  assert_eq!(
    imported.workbook["sheets"][0]["document"]["topics"]["child"]["collapsed"],
    true
  );
  assert_eq!(imported.workbook["sheets"][1]["name"], "第二页");

  let legacy = archive(&[
    (
      "content.xml",
      include_bytes!("../../tests/fixtures/xmind/legacy.xml").to_vec(),
    ),
    (
      "styles.xml",
      include_bytes!("../../tests/fixtures/xmind/styles.xml").to_vec(),
    ),
  ]);
  let imported = interchange::import(&legacy, "legacy.xmind").unwrap();
  assert_eq!(imported.workbook["sheets"].as_array().unwrap().len(), 2);
  let topics = &imported.workbook["sheets"][0]["document"]["topics"];
  assert_eq!(topics["legacy-a"]["title"], "甲 & 乙");
  assert_eq!(topics["legacy-root"]["style"]["shape"], "rounded");
  assert!(
    imported
      .warnings
      .iter()
      .any(|warning| warning.contains("游离"))
  );
}

#[test]
fn xmind_extension_roundtrip_keeps_resources_style_summary_and_priority() {
  let original = workbook();
  let exported = interchange::export(&original, "xmind", None).unwrap();
  assert!(exported.bytes.starts_with(b"PK"));
  let imported = interchange::import(&exported.bytes, "roundtrip.xmind")
    .unwrap()
    .workbook;
  assert_eq!(imported["id"], original["id"]);
  assert_eq!(imported["title"], original["title"]);
  assert_eq!(
    imported["sheets"][0]["document"]["settings"],
    original["sheets"][0]["document"]["settings"]
  );
  assert_eq!(
    imported["sheets"][0]["document"]["groups"],
    original["sheets"][0]["document"]["groups"]
  );
  assert_eq!(
    imported["sheets"][0]["document"]["topics"]["root"]["style"]["width"],
    240
  );
  assert_eq!(
    imported["sheets"][0]["document"]["topics"]["root"]["style"]["scale"],
    1.5
  );
  assert_eq!(
    imported["sheets"][0]["document"]["topics"]["root"]["style"]["spatialDepth"],
    125
  );
  assert_eq!(
    imported["sheets"][0]["document"]["topics"]["root"]["metadata"]["task"]["priority"],
    2
  );
  let asset_id = imported["sheets"][0]["document"]["topics"]["child"]["attachments"][0]
    .as_str()
    .unwrap();
  assert_eq!(
    imported["sheets"][0]["document"]["assets"][asset_id]["data"],
    "AP8B"
  );
  let selected = interchange::export(&original, "xmind", Some("second")).unwrap();
  assert_eq!(
    interchange::import(&selected.bytes, "selected.xmind")
      .unwrap()
      .workbook["sheets"]
      .as_array()
      .unwrap()
      .len(),
    1
  );
}

#[test]
fn single_sheet_xmind_export_removes_cross_sheet_topic_links() {
  let mut source = workbook();
  source["sheets"][0]["document"]["topics"]["root"]["metadata"]["link"] =
    json!({"kind":"topic","sheetId":"second","topicId":"other"});
  let complete = interchange::export(&source, "xmind", None).unwrap();
  let restored = interchange::import(&complete.bytes, "all.xmind")
    .unwrap()
    .workbook;
  assert_eq!(
    restored["sheets"][0]["document"]["topics"]["root"]["metadata"]["link"]["sheetId"],
    "second"
  );
  let selected = interchange::export(&source, "xmind", Some("first")).unwrap();
  let restored = interchange::import(&selected.bytes, "first.xmind")
    .unwrap()
    .workbook;
  assert!(restored["sheets"][0]["document"]["topics"]["root"]["metadata"]["link"].is_null());
}

#[test]
fn outline_formats_keep_multiple_sheets_and_plain_text() {
  let original = workbook();
  let opml = interchange::export(&original, "opml", None).unwrap();
  let imported = interchange::import(&opml.bytes, "outline.opml").unwrap();
  assert_eq!(imported.workbook["sheets"].as_array().unwrap().len(), 2);
  assert_eq!(imported.workbook["sheets"][0]["name"], "第一页");
  let markdown = interchange::export(&original, "markdown", None).unwrap();
  let imported = interchange::import(&markdown.bytes, "outline.md").unwrap();
  assert_eq!(imported.workbook["sheets"][0]["document"]["title"], "中心");
  let text = interchange::export(&original, "txt", None).unwrap();
  assert!(std::str::from_utf8(&text.bytes).unwrap().contains("分支"));
  assert_eq!(
    interchange::import(&text.bytes, "outline.txt")
      .unwrap()
      .workbook["sheets"]
      .as_array()
      .unwrap()
      .len(),
    2
  );
  assert!(interchange::import(b"<!DOCTYPE opml><opml><body/></opml>", "unsafe.opml").is_err());
  assert!(interchange::import(b"", "empty.md").is_err());
}

#[test]
fn archive_rejects_crc_path_zip64_and_limits() {
  let input =
    modern(json!([{"id":"sheet","title":"Map","rootTopic":{"id":"root","title":"Root"}}]));
  let mut corrupt = input.clone();
  let position = corrupt
    .windows(4)
    .position(|bytes| bytes == b"Root")
    .unwrap();
  corrupt[position] = b'X';
  assert!(interchange::import(&corrupt, "crc.xmind").is_err());
  let traversal = archive(&[("../content.json", b"[]".to_vec())]);
  assert!(interchange::import(&traversal, "path.xmind").is_err());
  let mut zip64 = input;
  let eocd = zip64
    .windows(4)
    .rposition(|bytes| bytes == b"PK\x05\x06")
    .unwrap();
  zip64[eocd + 8..eocd + 10].copy_from_slice(&u16::MAX.to_le_bytes());
  assert!(interchange::import(&zip64, "zip64.xmind").is_err());
  let oversized = archive(&[("content.json", vec![b' '; 10 * 1024 * 1024 + 1])]);
  assert!(interchange::import(&oversized, "oversized.xmind").is_err());
}
