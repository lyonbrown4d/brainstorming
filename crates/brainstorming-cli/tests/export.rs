#[path = "../../brainstorming-engine/tests/document_fixture.rs"]
mod fixture;
use brainstorming_engine::{
  application::ExportApplication,
  document::DocumentStore,
  document_exports::{Request, pipeline, scope},
};
use serde_json::json;
use std::{
  io::{Read, Write},
  path::Path,
  process::{Command, Output, Stdio},
  sync::Arc,
};

fn cli(input: &Path, output: &Path, extra: &[&str], password: Option<&str>) -> Output {
  let mut command = Command::new(env!("CARGO_BIN_EXE_brainstorming-cli"));
  command
    .env_remove("DISPLAY")
    .env_remove("WAYLAND_DISPLAY")
    .arg("export")
    .arg(input)
    .arg("-o")
    .arg(output)
    .args(extra)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  if password.is_some() {
    command.arg("--password-stdin");
  }
  let mut child = command.spawn().unwrap();
  if let Some(password) = password {
    writeln!(child.stdin.take().unwrap(), "{password}").unwrap();
  }
  child.wait_with_output().unwrap()
}
fn success(result: Output) {
  assert!(
    result.status.success(),
    "{}",
    String::from_utf8_lossy(&result.stderr)
  );
  let value: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
  assert!(value["bytes"].as_u64().unwrap() > 0);
}
async fn source(path: &Path, password: Option<&str>) -> serde_json::Value {
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["name"] = json!("First");
  let doc = &mut workbook["sheets"][0]["document"];
  doc["settings"]["visualStyle"] = json!("sketch");
  doc["topics"]["root"]["metadata"] = json!({"markers":["star","simple-icons:rust"]});
  doc["drawings"] = json!([{"id":"ink","color":"#123456","width":4,"points":[{"x":0,"y":0,"pressure":0.2},{"x":40,"y":30,"pressure":0.8}],"transform":{"x":15,"y":20,"scaleX":2,"scaleY":1.5}}]);
  let store = DocumentStore::new();
  store
    .write(path, workbook.clone(), password, None, None)
    .await
    .unwrap();
  store.shutdown().await.unwrap();
  workbook
}

#[tokio::test]
async fn headless_exports_share_desktop_pipeline_and_leave_source_untouched() {
  let folder = tempfile::tempdir().unwrap();
  let input = folder.path().join("map.brainstorming");
  let workbook = source(&input, None).await;
  let original = std::fs::read(&input).unwrap();
  for extension in ["svg", "png", "jpeg", "webp", "pdf"] {
    let output = folder.path().join(format!("result.{extension}"));
    success(cli(&input, &output, &["--scale", "1"], None));
    let bytes = std::fs::read(&output).unwrap();
    if extension == "svg" {
      let svg = String::from_utf8(bytes.clone()).unwrap();
      assert!(svg.contains("<path"));
    } else if extension == "pdf" {
      assert!(bytes.starts_with(b"%PDF-"));
    } else {
      let image = image::load_from_memory(&bytes).unwrap();
      assert!(image.width() > 10 && image.height() > 10);
    }
    // This is the same service entry invoked by desktop export_pipeline.
    let mut app = ExportApplication::start().await.unwrap();
    let mut request:Request=serde_json::from_value(json!({"jobId":uuid::Uuid::new_v4(),"workbook":workbook,"format":if extension=="jpeg"{"jpg"}else{extension},"sheetIds":["sheet-a"],"scale":1})).unwrap();
    request.workbook = scope::select(&request).unwrap();
    let job = app.exports.enter("desktop", request.job_id).await.unwrap();
    let report: pipeline::Reporter = Arc::new(|_, _, _| {});
    let pages = pipeline::prepare_pages(&app.compute, &request, &job, &report)
      .await
      .unwrap();
    let (job, expected) = pipeline::encode(request, pages, job, app.compute.clone())
      .await
      .unwrap();
    drop(job);
    // PDF document IDs may vary; raster and SVG output must match byte for byte.
    if extension != "pdf" {
      assert_eq!(bytes, expected, "{extension}");
    }
    app.shutdown().await.unwrap();
  }
  assert_eq!(std::fs::read(&input).unwrap(), original);
}

#[tokio::test]
async fn batch_order_encryption_and_destination_failures_are_safe() {
  let folder = tempfile::tempdir().unwrap();
  let input = folder.path().join("private.brainstorming");
  source(&input, Some("secret-for-test")).await;
  let original = std::fs::read(&input).unwrap();
  let output = folder.path().join("batch.zip");
  let failed = cli(
    &input,
    &output,
    &["--all-sheets", "-f", "svg"],
    Some("wrong"),
  );
  assert!(!failed.status.success());
  assert!(!output.exists());
  assert!(!String::from_utf8_lossy(&failed.stderr).contains("wrong"));
  success(cli(
    &input,
    &output,
    &["--all-sheets", "-f", "svg"],
    Some("secret-for-test"),
  ));
  let mut zip = zip::ZipArchive::new(std::fs::File::open(&output).unwrap()).unwrap();
  assert_eq!(zip.len(), 2);
  assert_eq!(zip.by_index(0).unwrap().name(), "001-First.svg");
  let mut second = String::new();
  zip
    .by_index(1)
    .unwrap()
    .read_to_string(&mut second)
    .unwrap();
  assert!(second.contains("另一个中心"));
  let existing = std::fs::read(&output).unwrap();
  assert!(
    !cli(
      &input,
      &output,
      &["--all-sheets", "-f", "svg"],
      Some("secret-for-test")
    )
    .status
    .success()
  );
  assert_eq!(std::fs::read(&output).unwrap(), existing);
  let alias = folder.path().join("alias.svg");
  std::fs::hard_link(&input, &alias).unwrap();
  assert!(
    !cli(&input, &alias, &["--overwrite"], Some("secret-for-test"))
      .status
      .success()
  );
  let invalid = folder.path().join("invalid.png");
  assert!(
    !cli(&input, &invalid, &["--scale", "0"], Some("secret-for-test"))
      .status
      .success()
  );
  assert!(
    !cli(
      &input,
      &invalid,
      &["--sheet", "missing"],
      Some("secret-for-test")
    )
    .status
    .success()
  );
  assert!(!invalid.exists());
  assert_eq!(std::fs::read(&input).unwrap(), original);
}
