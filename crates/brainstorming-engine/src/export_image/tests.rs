use super::*;
use std::sync::{Arc, Mutex};

fn request(format: Format, content: &str) -> Request {
  Request {
    job_id: uuid::Uuid::new_v4(),
    format,
    suggested_name: "map".into(),
    svg: format!(
      r#"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">{content}</svg>"#
    ),
    width: 120.0,
    height: 80.0,
    scale: None,
    quality: None,
  }
}
async fn output(service: &ImageExportService, request: Request) -> (Vec<u8>, Vec<Stage>) {
  let stages = Arc::new(Mutex::new(Vec::new()));
  let captured = stages.clone();
  let lease = service.enter(request.job_id).await.unwrap();
  let (bytes, _) = service
    .render(
      request,
      lease,
      Arc::new(move |stage| {
        captured.lock().unwrap().push(stage);
      }),
    )
    .await
    .unwrap();
  let recorded = stages.lock().unwrap().clone();
  (bytes, recorded)
}
#[tokio::test]
async fn native_codecs_emit_real_formats_and_adaptive_dimensions() {
  let service = ImageExportService::default();
  for (format, mime) in [
    (Format::Png, "image/png"),
    (Format::Jpg, "image/jpeg"),
    (Format::Webp, "image/webp"),
  ] {
    let (bytes, stages) = output(
      &service,
      request(
        format,
        r##"<rect width="120" height="80" fill="#2468ac"/>"##,
      ),
    )
    .await;
    assert_eq!(infer::get(&bytes).unwrap().mime_type(), mime);
    let image = image::load_from_memory(&bytes).unwrap();
    assert_eq!((image.width(), image.height()), (240, 160));
    assert_eq!(stages, [Stage::Rendering, Stage::Encoding]);
  }
  service.shutdown().await;
}
#[tokio::test]
async fn lossless_codecs_preserve_straight_alpha_and_jpeg_composites_white() {
  let service = ImageExportService::default();
  for format in [Format::Png, Format::Webp] {
    let (bytes, _) = output(
      &service,
      request(
        format,
        r#"<rect width="120" height="80" fill="red" opacity="0.5"/>"#,
      ),
    )
    .await;
    let image = image::load_from_memory(&bytes).unwrap().into_rgba8();
    let pixel = image.get_pixel(20, 20).0;
    assert_eq!(pixel[0], 255);
    assert_eq!((pixel[1], pixel[2]), (0, 0));
    assert!((127..=128).contains(&pixel[3]));
  }
  let (bytes, _) = output(&service, request(Format::Jpg, "")).await;
  let image = image::load_from_memory(&bytes).unwrap().into_rgb8();
  assert_eq!(image.get_pixel(20, 20).0, [255, 255, 255]);
}
#[tokio::test]
async fn chinese_glyphs_use_real_distinct_system_font_outlines() {
  let service = ImageExportService::default();
  let mut images = Vec::new();
  for character in ["中", "文"] {
    let markup =
      format!(r#"<text x="10" y="55" font-family="sans-serif" font-size="48">{character}</text>"#);
    let (bytes, _) = output(&service, request(Format::Png, &markup)).await;
    let pixels = image::load_from_memory(&bytes).unwrap().into_rgba8();
    assert!(
      pixels.pixels().filter(|pixel| pixel.0[3] > 0).count() > 300,
      "CJK glyph must render"
    );
    images.push(pixels);
  }
  assert_ne!(
    images[0], images[1],
    "Two CJK characters must not become identical missing-glyph boxes"
  );
}
#[test]
fn rejects_unsafe_svg_references_and_bounded_input_failures() {
  for content in [
    r#"<image href="file:///etc/passwd"/>"#,
    r#"<image href="https://example.com/picture.png"/>"#,
    r#"<image href="data:image/svg+xml;base64,PHN2Zy8+"/>"#,
    "<script>alert(1)</script>",
    "<foreignObject/>",
    r#"<rect style="fill:url(file:///secret)"/>"#,
    r#"<rect onload="alert(1)"/>"#,
    r##"<use href="#a"/>"##,
  ] {
    assert!(
      validation::scene(&request(Format::Png, content)).is_err(),
      "{content}"
    );
  }
  let mut invalid = request(Format::Png, "");
  invalid.svg =
    r#"<!DOCTYPE svg [<!ENTITY x "text">]><svg xmlns="http://www.w3.org/2000/svg"/>"#.into();
  assert!(validation::scene(&invalid).is_err());
  invalid.width = f64::NAN;
  assert!(invalid.validate().is_err());
  invalid.width = 1_000_001.0;
  assert!(invalid.validate().is_err());
  invalid.width = 120.0;
  invalid.scale = Some(100.0);
  assert!(invalid.validate().is_err());
  invalid.scale = None;
  invalid.svg = "x".repeat(MAX_SVG_BYTES + 1);
  assert!(invalid.validate().is_err());
}
#[tokio::test]
async fn rejects_intrinsic_dimension_mismatch_and_keeps_svg_scene_exact() {
  let service = ImageExportService::default();
  let mut mismatch = request(Format::Png, "");
  mismatch.width = 100.0;
  let lease = service.enter(mismatch.job_id).await.unwrap();
  assert!(
    service
      .render(mismatch, lease, Arc::new(|_| {}))
      .await
      .is_err()
  );
  let scene = request(Format::Svg, r#"<text x="10" y="20">中文</text>"#);
  let expected = scene.svg.clone();
  let (bytes, stages) = output(&service, scene).await;
  assert_eq!(bytes, expected.as_bytes());
  assert_eq!(stages, [Stage::Rendering]);
}
#[tokio::test]
async fn queue_is_bounded_and_shutdown_drains_active_then_rejects_new_jobs() {
  let service = Arc::new(ImageExportService::default());
  let active_id = uuid::Uuid::new_v4();
  let active = service.enter(active_id).await.unwrap();
  assert!(service.enter(active_id).await.is_err());
  let mut queued = Vec::new();
  // Poll three waiting futures once, so queue occupancy is deterministic without sleeps.
  for _ in 0..3 {
    let service = service.clone();
    let mut future = Box::pin(async move { service.enter(uuid::Uuid::new_v4()).await });
    assert!(futures_util::poll!(future.as_mut()).is_pending());
    queued.push(future);
  }
  assert!(service.enter(uuid::Uuid::new_v4()).await.is_err());
  let mut closing = Box::pin(service.shutdown());
  assert!(futures_util::poll!(closing.as_mut()).is_pending());
  for future in queued {
    assert!(future.await.is_err());
  }
  assert!(futures_util::poll!(closing.as_mut()).is_pending());
  drop(active);
  closing.await;
  assert!(service.enter(uuid::Uuid::new_v4()).await.is_err());
}
#[test]
fn adaptive_budget_and_jpeg_quality_follow_native_contract() {
  let mut scene = request(Format::Png, "");
  scene.width = 10000.0;
  scene.height = 10000.0;
  let (width, height) = scene.validate().unwrap();
  assert!(u64::from(width) * u64::from(height) <= MAX_PIXELS);
  scene.scale = Some(1.0);
  assert!(scene.validate().is_err());
  scene.width = 120.0;
  scene.height = 80.0;
  scene.quality = Some(92);
  assert!(scene.validate().is_err());
  scene.format = Format::Jpg;
  assert!(scene.validate().is_ok());
  scene.quality = Some(0);
  assert!(scene.validate().is_err());
}
