use super::*;
use base64::Engine;
use image::ImageEncoder;
use std::sync::Arc;

fn scene(content: &str) -> Request {
  Request {
    job_id: uuid::Uuid::new_v4(),
    format: Format::Png,
    suggested_name: "map".into(),
    svg: format!(
      r#"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">{content}</svg>"#
    ),
    width: 120.0,
    height: 80.0,
    scale: None,
    quality: None,
  }
}
#[tokio::test]
async fn generated_relation_arrow_and_bounded_inline_image_render() {
  let mut bytes = Vec::new();
  image::codecs::png::PngEncoder::new(&mut bytes)
    .write_image(&[255, 0, 0, 255], 1, 1, image::ExtendedColorType::Rgba8)
    .unwrap();
  let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
  let content = format!(
    r##"<marker id="export-arrow-0" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="red"/></marker><path d="M 10 10 L 110 60" stroke="red" marker-end="url(#export-arrow-0)"/><image width="10" height="10" href="data:image/png;base64,{encoded}"/>"##
  );
  let service = ImageExportService::default();
  let request = scene(&content);
  let lease = service.enter(request.job_id).await.unwrap();
  let (bytes, _) = service
    .render(request, lease, Arc::new(|_| {}))
    .await
    .unwrap();
  let image = image::load_from_memory(&bytes).unwrap().into_rgba8();
  assert!(image.pixels().any(|pixel| pixel.0 == [255, 0, 0, 255]));
}
#[test]
fn rejects_external_or_recursive_markers_and_huge_embedded_pixel_allocation() {
  for content in [
    r##"<path marker-end="url(https://example.com/arrow.svg#a)"/>"##,
    r##"<path marker-end="url(#export-arrow-0)"/>"##,
    r##"<g><marker id="export-arrow-0"/></g>"##,
    r##"<rect fill="u\72l(https://example.com/paint)"/>"##,
  ] {
    assert!(validation::scene(&scene(content)).is_err());
  }
  let mut bytes = Vec::new();
  {
    let mut encoder = png::Encoder::new(&mut bytes, 20_000, 1);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&vec![0; 20_000 * 4]).unwrap();
  }
  let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
  let content =
    format!(r#"<image width="10" height="10" href="data:image/png;base64,{encoded}"/>"#);
  assert!(validation::scene(&scene(&content)).is_err());
}
#[test]
fn request_accepts_only_jpeg_quality_contract_and_large_source_can_downscale() {
  let mut request = scene("");
  request.width = 100_000.0;
  request.height = 100.0;
  let (width, height) = request.validate().unwrap();
  assert!(width <= MAX_DIMENSION && height <= MAX_DIMENSION);
  let base = serde_json::json!({
      "jobId": uuid::Uuid::new_v4(), "format": "jpg", "suggestedName": "map",
      "svg": "<svg/>", "width": 10, "height": 10, "jpegQuality": 92,
  });
  assert_eq!(
    serde_json::from_value::<Request>(base.clone())
      .unwrap()
      .quality,
    Some(92)
  );
  let mut unknown = base;
  unknown["quality"] = serde_json::json!(92);
  assert!(serde_json::from_value::<Request>(unknown).is_err());
}
