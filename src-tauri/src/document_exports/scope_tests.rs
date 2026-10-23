use super::{ExportScope, Page, Request, encode, scope};
use serde_json::{Value, json};
use std::io::{Cursor, Read};

pub(super) fn workbook() -> Value {
  json!({"format":"brainstorming","version":2,"id":"workbook","title":"Root map","sheets":[
    {"id":"first","name":"First","document":{"format":"brainstorming","version":1,"id":"doc-first","title":"Root map","rootId":"root","topics":{
      "root":{"id":"root","title":"Root map","side":"right","collapsed":false,"children":["alpha","beta","summary","floating"]},
      "alpha":{"id":"alpha","title":"Alpha branch","side":"left","collapsed":true,"children":["leaf"],"metadata":{"task":{"dependencies":["beta"]}}},
      "leaf":{"id":"leaf","title":"Leaf detail","side":"left","collapsed":false,"children":[]},
      "beta":{"id":"beta","title":"Beta branch","side":"right","collapsed":false,"children":[],"attachments":["excluded-asset"],"metadata":{"link":{"kind":"topic","sheetId":"second","topicId":"other"}}},
      "summary":{"id":"summary","title":"Summary","side":"right","collapsed":false,"children":[]},
      "floating":{"id":"floating","title":"Floating idea","side":"right","collapsed":false,"children":[]}
    },"assets":{"excluded-asset":{"id":"excluded-asset","name":"private-notes.txt","mimeType":"text/plain","data":"RXhjbHVkZWQgcHJpdmF0ZSB0ZXh0"}},"settings":{"background":"#123456"},"floatingIds":["floating"],"floatingPositions":{"floating":{"x":30,"y":40}},
      "groups":[{"id":"group","kind":"summary","topicIds":["alpha","beta"],"summaryTopicId":"summary"}],
      "relations":[{"id":"relation","from":"alpha","to":"leaf"}],"callouts":[{"id":"callout","topicId":"leaf","text":"Kept annotation"}],
      "drawings":[{"id":"ink","color":"#112233","width":4,"points":[{"x":0,"y":0,"pressure":0.5},{"x":20,"y":30,"pressure":0.5}]}]}},
    {"id":"second","name":"Second","document":{"format":"brainstorming","version":1,"id":"doc-second","title":"Other map","rootId":"other","topics":{"other":{"id":"other","title":"Other map","side":"right","collapsed":false,"children":[]}}}}
  ]})
}

pub(super) fn request(workbook: Value) -> Request {
  serde_json::from_value(json!({"jobId":uuid::Uuid::new_v4(),"workbook":workbook,"format":"json","scope":"current","sheetIds":["first"]})).unwrap()
}

#[test]
fn branch_export_keeps_descendants_and_repairs_references_without_mutating_snapshot() {
  let original = workbook();
  crate::document::validate_workbook(&original).unwrap();
  let mut request = request(original.clone());
  request.scope = ExportScope::Branch;
  request.topic_ids = vec!["alpha".into()];
  request.transparent = true;
  let result = scope::select(&request).unwrap();
  assert_eq!(request.workbook, original);
  crate::document::validate_workbook(&result).unwrap();
  let doc = &result["sheets"][0]["document"];
  assert_eq!(doc["rootId"], "alpha");
  assert_eq!(doc["title"], "Alpha branch");
  assert_eq!(doc["topics"].as_object().unwrap().len(), 2);
  assert_eq!(doc["topics"]["alpha"]["side"], "right");
  assert_eq!(doc["topics"]["alpha"]["collapsed"], false);
  assert!(
    doc["topics"]["alpha"]["metadata"]["task"]["dependencies"]
      .as_array()
      .is_none_or(Vec::is_empty)
  );
  assert!(
    doc["floatingPositions"]
      .as_object()
      .is_none_or(serde_json::Map::is_empty)
  );
  assert!(doc["groups"].as_array().is_none_or(Vec::is_empty));
  assert_eq!(doc["relations"][0]["id"], "relation");
  assert_eq!(doc["callouts"][0]["text"], "Kept annotation");
  assert_eq!(doc["settings"]["background"], "#123456");
  assert!(doc["assets"].get("excluded-asset").is_none());
}

#[test]
fn disconnected_selected_topics_remain_reachable_and_summary_references_are_pruned() {
  let mut request = request(workbook());
  request.scope = ExportScope::Topics;
  request.topic_ids = vec!["alpha".into(), "beta".into()];
  let selected = scope::select(&request).unwrap();
  crate::document::validate_workbook(&selected).unwrap();
  let doc = &selected["sheets"][0]["document"];
  assert_eq!(doc["topics"].as_object().unwrap().len(), 2);
  assert_eq!(doc["floatingIds"].as_array().unwrap().len(), 1);
  assert!(doc["groups"].as_array().is_none_or(Vec::is_empty));
  assert_eq!(
    doc["topics"]["alpha"]["metadata"]["task"]["dependencies"],
    json!(["beta"])
  );
  request.topic_ids.push("summary".into());
  let with_summary = scope::select(&request).unwrap();
  crate::document::validate_workbook(&with_summary).unwrap();
}

#[test]
fn multiple_sheets_preserve_selected_links_and_reject_missing_or_duplicate_targets() {
  let mut request = request(workbook());
  request.sheet_ids.push("second".into());
  let selected = scope::select(&request).unwrap();
  assert_eq!(
    selected["sheets"][0]["document"]["topics"]["beta"]["metadata"]["link"]["sheetId"],
    "second"
  );
  request.sheet_ids = vec!["first".into()];
  assert!(
    scope::select(&request).unwrap()["sheets"][0]["document"]["topics"]["beta"]["metadata"]
      .get("link")
      .is_none()
  );
  request.sheet_ids = vec!["first".into(), "first".into()];
  assert!(scope::select(&request).is_err());
  request.sheet_ids = vec!["missing".into()];
  assert!(scope::select(&request).is_err());
  request.sheet_ids = vec!["first".into()];
  request.topic_ids = vec!["missing".into()];
  assert!(scope::select(&request).is_err());
}

#[test]
fn drawing_selection_rejects_unknown_strokes_and_keeps_requested_ink() {
  let mut request = request(workbook());
  request.scope = ExportScope::Topics;
  request.drawing_ids = vec!["ink".into()];
  let selected = scope::select(&request).unwrap();
  assert_eq!(
    selected["sheets"][0]["document"]["drawings"][0]["id"],
    "ink"
  );
  assert_eq!(
    selected["sheets"][0]["document"]["drawings"]
      .as_array()
      .unwrap()
      .len(),
    1
  );
  let mut geometry = crate::scene::VisualGeometry::default();
  geometry
    .drawing_paths
    .insert("ink".into(), "M0 0 L20 0 L20 30 Z".into());
  let page = super::ink::render(&selected["sheets"][0]["document"], &geometry).unwrap();
  assert!(!page.svg.contains("<text"));
  assert!(page.svg.contains("#123456"));
  assert!(page.svg.contains("M0 0 L20 0 L20 30 Z"));
  request.drawing_ids = vec!["missing-ink".into()];
  assert!(scope::select(&request).is_err());
}

#[test]
fn batch_svg_archive_uses_actual_extension_and_safe_distinct_entry_names() {
  let mut request = request(workbook());
  request.format = super::ExportFormat::Svg;
  let page=Page {title:"../unsafe/name".into(),svg:"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><rect width=\"10\" height=\"10\" fill=\"#123456\"/></svg>".into(),width:10.,height:10.};
  assert_eq!(encode::extension(&request, 1), "svg");
  assert_eq!(encode::extension(&request, 2), "zip");
  let bytes = encode::pages(&request, &[page.clone(), page]).unwrap();
  let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
  assert_eq!(archive.len(), 2);
  for index in 0..archive.len() {
    let mut entry = archive.by_index(index).unwrap();
    let name = entry.name().unwrap().into_owned();
    assert!(name.ends_with(".svg") && !name.contains('/') && !name.contains('\\'));
    assert!(name.starts_with(&format!("{:03}-", index + 1)));
    let mut svg = String::new();
    entry.read_to_string(&mut svg).unwrap();
    assert!(svg.starts_with("<svg"));
  }
}

#[test]
fn export_encoding_uses_frozen_selected_content_and_checks_raster_bounds() {
  let mut source = workbook();
  let mut frozen = request(source.clone());
  frozen.workbook = scope::select(&frozen).unwrap();
  source["sheets"][0]["document"]["topics"]["root"]["title"] = json!("Changed after export");
  let bytes = encode::pages(&frozen, &[]).unwrap();
  let value: Value = serde_json::from_slice(&bytes).unwrap();
  assert_eq!(
    value["workbook"]["sheets"][0]["document"]["topics"]["root"]["title"],
    "Root map"
  );
  frozen.format = super::ExportFormat::Png;
  frozen.width = Some(16385);
  let page = Page {
    title: "Bounds".into(),
    svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"/>".into(),
    width: 10.,
    height: 10.,
  };
  assert!(encode::pages(&frozen, &[page]).is_err());
}

#[test]
fn presentation_svg_with_cover_images_passes_shared_native_raster_validation() {
  use base64::Engine;
  let mut source = workbook();
  let mut png = Cursor::new(Vec::new());
  image::DynamicImage::new_rgb8(4, 2)
    .write_to(&mut png, image::ImageFormat::Png)
    .unwrap();
  let doc = &mut source["sheets"][0]["document"];
  doc["assets"]["picture"] = json!({"id":"picture","name":"image.png","mimeType":"image/png","data":base64::engine::general_purpose::STANDARD.encode(png.into_inner())});
  doc["topics"]["alpha"]["image"] = json!({"assetId":"picture","width":4,"height":2});
  doc["presentation"] = json!([{"topicId":"alpha","layout":"image","notes":"Speaker note","appearance":{"image":{"fit":"cover"}}}]);
  let mut request = request(source);
  request.format = super::ExportFormat::Png;
  request.width = Some(320);
  request.height = Some(180);
  request.workbook = scope::select(&request).unwrap();
  let pages = super::presentation::pages(&request.workbook).unwrap();
  for page in &pages {
    crate::export_image::validate_svg_scene(&page.svg).unwrap();
  }
  let bytes = encode::pages(&request, &pages).unwrap();
  assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 320);
}
