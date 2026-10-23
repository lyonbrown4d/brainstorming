use super::*;
use lopdf::{Document, content::Content};
use std::{io::Write, process::Command};

fn page(title: &str, width: f64, height: f64) -> Page {
  Page {
    title: title.into(),
    svg: format!(
      "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\"><rect x=\"10\" y=\"10\" width=\"80\" height=\"40\" fill=\"#eeeeee\"/><text x=\"15\" y=\"35\" font-size=\"16\">{title}</text></svg>"
    ),
    width,
    height,
  }
}

fn media_box(document: &Document, number: u32) -> (f64, f64) {
  let id = document.get_pages()[&number];
  let page = document.get_object(id).unwrap().as_dict().unwrap();
  let box_values = page.get(b"MediaBox").unwrap().as_array().unwrap();
  let width = box_values[2].as_float().unwrap() as f64;
  let height = box_values[3].as_float().unwrap() as f64;
  (width, height)
}

#[test]
fn multipage_pdf_contains_vector_form_and_embedded_text() {
  let bytes = encode(
    &[page("Alpha", 320.0, 180.0), page("Beta", 180.0, 320.0)],
    &PdfOptions::default(),
  )
  .unwrap();
  let document = Document::load_mem(&bytes).unwrap();
  assert_eq!(document.get_pages().len(), 2);
  let (first_width, first_height) = media_box(&document, 1);
  assert!((first_width - (320.0 * 0.75 + 24.0 * POINTS_PER_MM)).abs() < 0.1);
  assert!((first_height - (180.0 * 0.75 + 24.0 * POINTS_PER_MM)).abs() < 0.1);
  assert!(document.objects.values().any(|object| {
    let Ok(stream) = object.as_stream() else {
      return false;
    };
    stream
      .dict
      .get(b"Subtype")
      .is_ok_and(|value| value.as_name().ok() == Some(b"Form"))
  }));
  assert!(document.objects.values().any(|object| {
    let Ok(stream) = object.as_stream() else {
      return false;
    };
    let Ok(bytes) = stream.decompressed_content() else {
      return false;
    };
    let Ok(content) = Content::decode(&bytes) else {
      return false;
    };
    content
      .operations
      .iter()
      .any(|operation| matches!(operation.operator.as_str(), "Tj" | "TJ"))
      && content
        .operations
        .iter()
        .any(|operation| matches!(operation.operator.as_str(), "re" | "m" | "c"))
  }));
  assert!(document.objects.values().any(|object| {
    let Ok(dictionary) = object.as_dict() else {
      return false;
    };
    dictionary.get(b"ToUnicode").is_ok()
  }));
}

#[test]
fn paper_fit_and_tiling_have_expected_pages() {
  let source = page("Tiled", 1400.0, 900.0);
  let fit = PdfOptions {
    paper: Paper::A4,
    ..PdfOptions::default()
  };
  let fit_pdf = Document::load_mem(&encode(&[source.clone()], &fit).unwrap()).unwrap();
  assert_eq!(fit_pdf.get_pages().len(), 1);
  let (width, height) = media_box(&fit_pdf, 1);
  assert!((width - 297.0 * POINTS_PER_MM).abs() < 0.1);
  assert!((height - 210.0 * POINTS_PER_MM).abs() < 0.1);

  let tiled = PdfOptions {
    paginate: true,
    ..fit
  };
  let tiled_pdf = Document::load_mem(&encode(&[source], &tiled).unwrap()).unwrap();
  assert!(tiled_pdf.get_pages().len() > 1);
  assert!(tiled_pdf.get_pages().len() <= MAX_PAGES);
}

#[test]
fn rejects_external_resources_and_bad_geometry() {
  let mut external = page("External", 100.0, 100.0);
  external.svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><image href=\"file:///tmp/secret.png\"/></svg>".into();
  assert!(encode(&[external], &PdfOptions::default()).is_err());
  let mut invalid = page("Invalid", 100.0, 100.0);
  invalid.width = f64::NAN;
  assert!(encode(&[invalid], &PdfOptions::default()).is_err());
  assert!(
    encode(
      &[page("Large", 100.0, 100.0)],
      &PdfOptions {
        margin_mm: 80.0,
        ..PdfOptions::default()
      }
    )
    .is_err()
  );
  assert!(serde_json::from_str::<PdfOptions>(r#"{"paper":"a4","unknown":true}"#).is_err());
  assert!(matches!(
    Document::load_mem(&encode(&[page("Okay", 100.0, 100.0)], &PdfOptions::default()).unwrap()),
    Ok(_)
  ));
}

#[test]
fn chinese_text_is_extractable_when_poppler_is_available() {
  if Command::new("pdftotext").arg("-v").output().is_err() {
    return;
  }
  let bytes = encode(
    &[page("你好世界 Alpha", 320.0, 100.0)],
    &PdfOptions::default(),
  )
  .unwrap();
  let mut file = tempfile::NamedTempFile::new().unwrap();
  file.write_all(&bytes).unwrap();
  let output = Command::new("pdftotext")
    .args(["-layout", file.path().to_str().unwrap(), "-"])
    .output()
    .unwrap();
  assert!(output.status.success());
  assert!(
    String::from_utf8(output.stdout)
      .unwrap()
      .contains("你好世界 Alpha")
  );
}
