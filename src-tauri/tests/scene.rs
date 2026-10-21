use base64::{Engine, engine::general_purpose::STANDARD};
use brainstorming_native::export_image::{Format, ImageExportService, Request};
use brainstorming_native::scene::{self, VisualGeometry};
use serde_json::{Value, json};

fn workbook() -> Value {
  json!({"format":"brainstorming","version":2,"id":"book","title":"画册","sheets":[
    {"id":"sheet","name":"画布","document":{"format":"brainstorming","version":1,"id":"doc","title":"中心","rootId":"root","topics":{
      "root":{"id":"root","title":"中心","children":["child"],"collapsed":false,"side":"right"},
      "child":{"id":"child","title":"分支","children":[],"collapsed":false,"side":"right","style":{"shape":"diamond"}}
    }}}
  ]})
}

#[test]
fn renders_layout_shapes_and_escaped_text() {
  let mut book = workbook();
  book["sheets"][0]["document"]["topics"]["child"]["title"] = json!("甲 <script>alert(1)</script>");
  let scene = scene::render(&book, "sheet", false).unwrap();
  assert!(scene.width > 100.0 && scene.height > 40.0);
  assert!(scene.svg.contains("甲 &lt;script&gt;"));
  assert!(!scene.svg.contains("<script>"));
  assert!(scene.svg.contains("<path"));
  assert!(scene.svg.contains("viewBox="));
}

#[test]
fn topic_scale_expands_layout_once_and_scales_shape_and_content_together() {
  let mut book = workbook();
  book["sheets"][0]["document"]["topics"]["root"]["children"] = json!([]);
  book["sheets"][0]["document"]["topics"]
    .as_object_mut()
    .unwrap()
    .remove("child");
  book["sheets"][0]["document"]["topics"]["root"]["style"] = json!({"shape":"ellipse","width":200});
  let normal = scene::render(&book, "sheet", false).unwrap();
  book["sheets"][0]["document"]["topics"]["root"]["style"]["scale"] = json!(2);
  let scaled = scene::render(&book, "sheet", false).unwrap();
  assert_eq!(scaled.width - normal.width, 200.0);
  assert!(scaled.svg.contains("scale(2.00)"));
  assert!(scaled.svg.contains("rx=\"100.00\""));
  assert!(scaled.svg.contains("font-size=\"24.00\""));
  assert!(!scaled.svg.contains("rx=\"200.00\""));
}

#[test]
fn sketch_and_ink_require_shared_cached_geometry() {
  let mut book = workbook();
  book["sheets"][0]["document"]["settings"] = json!({"visualStyle":"sketch"});
  assert!(
    scene::render(&book, "sheet", false)
      .unwrap_err()
      .contains("共享")
  );
  let mut geometry = VisualGeometry::default();
  geometry
    .topic_outlines
    .insert("root".into(), "M 0 0 L 10 10".into());
  geometry
    .topic_outlines
    .insert("child".into(), "M 0 0 L 10 10".into());
  geometry
    .edge_paths
    .insert("edge-child".into(), "M 0 0 L 10 10".into());
  let rendered = scene::render_with_geometry(&book, "sheet", false, Some(&geometry)).unwrap();
  assert!(rendered.svg.contains("data-sketch=\"outline\""));
}

#[test]
fn rejects_script_in_shared_geometry() {
  let mut book = workbook();
  book["sheets"][0]["document"]["settings"] = json!({"visualStyle":"sketch"});
  let mut geometry = VisualGeometry::default();
  geometry
    .topic_outlines
    .insert("root".into(), "M 0 0 <script>".into());
  geometry
    .topic_outlines
    .insert("child".into(), "M 0 0 L 10 10".into());
  geometry
    .edge_paths
    .insert("edge-child".into(), "M 0 0 L 10 10".into());
  assert!(
    scene::render_with_geometry(&book, "sheet", false, Some(&geometry))
      .unwrap_err()
      .contains("非法字符")
  );
}

#[test]
fn preserves_bundled_marker_strokes_and_rejects_marker_scripts() {
  let mut book = workbook();
  book["sheets"][0]["document"]["topics"]["child"]["metadata"] = json!({"markers":["star"]});
  let mut geometry = VisualGeometry::default();
  geometry.marker_icons.insert("child".into(), vec!["<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#123456\" stroke-width=\"2\"><path d=\"M 1 1 L 20 20\"/></svg>".into()]);
  let rendered = scene::render_with_geometry(&book, "sheet", false, Some(&geometry)).unwrap();
  assert!(rendered.svg.contains("stroke=\"#123456\""));
  geometry.marker_icons.insert(
    "child".into(),
    vec!["<svg viewBox=\"0 0 24 24\"><script>alert(1)</script></svg>".into()],
  );
  assert!(
    scene::render_with_geometry(&book, "sheet", false, Some(&geometry))
      .unwrap_err()
      .contains("不安全标签")
  );
}

#[test]
fn large_vector_scene_can_be_scaled_for_bounded_preview() {
  let mut book = workbook();
  book["sheets"][0]["document"]["topics"]["child"]["style"]["offsetX"] = json!(20_000);
  book["sheets"][0]["document"]["topics"]["child"]["style"]["offsetY"] = json!(3_000);
  let scene = scene::render(&book, "sheet", false).unwrap();
  assert!(scene.width > 16_384.0);
  assert!(scene.width * scene.height > 40_000_000.0);
  let preview_scale = (1_600.0 / scene.width.max(scene.height)).min(1.0);
  let request = Request {
    job_id: uuid::Uuid::new_v4(),
    format: Format::Png,
    suggested_name: "preview.png".into(),
    svg: scene.svg,
    width: scene.width,
    height: scene.height,
    scale: Some(preview_scale),
    quality: None,
  };
  let (width, height) = request.validate().unwrap();
  assert!(width <= 1_600 && height <= 1_600);
}

#[tokio::test]
async fn generated_relation_image_and_icon_pass_native_raster_validation() {
  let mut image = Vec::new();
  {
    let mut encoder = png::Encoder::new(&mut image, 1, 1);
    encoder.set_color(png::ColorType::Rgba);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&[255, 0, 0, 255]).unwrap();
  }
  let mut book = workbook();
  let document = &mut book["sheets"][0]["document"];
  document["assets"] = json!({"pic":{"id":"pic","name":"pic.png","mimeType":"image/png","data":STANDARD.encode(image)}});
  document["topics"]["child"]["image"] = json!({"assetId":"pic","width":24,"height":24});
  document["topics"]["child"]["metadata"] = json!({"markers":["star"]});
  document["relations"] = json!([{"id":"relation","from":"root","to":"child","arrow":"end"}]);
  let mut geometry = VisualGeometry::default();
  geometry.marker_icons.insert(
    "child".into(),
    vec!["<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#123456\"><path d=\"M 1 1 L 20 20\"/></svg>".into()],
  );
  let scene = scene::render_with_geometry(&book, "sheet", false, Some(&geometry)).unwrap();
  assert!(scene.svg.contains("export-arrow-"));
  let service = ImageExportService::default();
  let request = Request {
    job_id: uuid::Uuid::new_v4(),
    format: Format::Png,
    suggested_name: "scene.png".into(),
    svg: scene.svg,
    width: scene.width,
    height: scene.height,
    scale: Some(1.0),
    quality: None,
  };
  let lease = service.enter(request.job_id).await.unwrap();
  let (png, _) = service
    .render(request, lease, std::sync::Arc::new(|_| {}))
    .await
    .unwrap();
  assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
  service.shutdown().await;
}
