use super::{catalog::Catalog, import::Importer};
use crate::{application::Backend, transport::ResourceBackend};
use base64::Engine;
use std::{path::Path, sync::Arc};
use tokio_util::sync::CancellationToken;

fn png(variant: bool) -> Vec<u8> {
  let encoded = if variant {
    // The same pixel with an additional valid PNG text chunk: different
    // original content must miss even when the rendered pixels are equal.
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAABl0RVh0RGVzY3JpcHRpb24AY2FjaGUtdmFyaWFudCbgA7UAAAAASUVORK5CYII="
  } else {
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="
  };
  base64::engine::general_purpose::STANDARD
    .decode(encoded)
    .unwrap()
}
async fn fixture() -> (tempfile::TempDir, Backend, Importer) {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().join("native"), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let importer = Importer::new(state.clone(), Arc::new(Catalog::new(state.clone())));
  (directory, backend, importer)
}
async fn block_generation(directory: &Path) {
  let work = directory.join("image-work");
  if tokio::fs::try_exists(&work).await.unwrap() {
    tokio::fs::remove_dir_all(&work).await.unwrap();
  }
  tokio::fs::write(work, b"generation intentionally unavailable")
    .await
    .unwrap();
}
#[tokio::test]
async fn file_cache_hit_keeps_new_identity_and_reauthorizes_resources() {
  let (directory, backend, mut importer) = fixture().await;
  let state = backend.state.clone();
  let original = directory.path().join("original.png");
  let renamed = directory.path().join("different name.png");
  tokio::fs::write(&original, png(false)).await.unwrap();
  tokio::fs::copy(&original, &renamed).await.unwrap();
  let first = importer.file(&original, "image").await.unwrap();
  block_generation(&state.directory).await;
  // Discard catalog permissions independently of cached storage metadata.
  importer.catalog = Arc::new(Catalog::new(state.clone()));
  let id = first["storage"]["objectId"].as_str().unwrap();
  assert!(importer.catalog.info(id).await.is_err());
  // A miss would now fail creating image-work. Success proves libvips outputs
  // were reused while asset naming/identity and authorization ran anew.
  let second = importer.file(&renamed, "image").await.unwrap();
  assert_eq!(second["storage"], first["storage"]);
  assert_ne!(second["id"], first["id"]);
  assert_eq!(second["name"], "different name.png");
  assert_eq!(
    importer.catalog.info(id).await.unwrap().mime_type,
    "image/png"
  );
  let preview = second["storage"]["preview"]["objectId"].as_str().unwrap();
  assert_eq!(
    importer.catalog.info(preview).await.unwrap().mime_type,
    "image/webp"
  );
  assert!(importer.catalog.tile(id, 0, 0, 0).await.unwrap().is_some());
  let cancel = CancellationToken::new();
  cancel.cancel();
  assert!(
    importer
      .file_with_cancel(&renamed, "image", cancel)
      .await
      .unwrap_err()
      .contains("取消")
  );
  backend.shutdown().await.unwrap();
}
#[tokio::test]
async fn changed_content_misses_failures_retry_and_importer_instances_are_isolated() {
  let (directory, backend, importer) = fixture().await;
  let state = backend.state.clone();
  let path = directory.path().join("image.png");
  tokio::fs::write(&path, png(false)).await.unwrap();
  let first = importer.file(&path, "image").await.unwrap();
  block_generation(&state.directory).await;
  tokio::fs::write(&path, png(true)).await.unwrap();
  assert!(importer.file(&path, "image").await.is_err());
  tokio::fs::remove_file(state.directory.join("image-work"))
    .await
    .unwrap();
  // The transient derivative failure cannot poison a retry for this new hash.
  let changed = importer.file(&path, "image").await.unwrap();
  assert_ne!(changed["storage"]["objectId"], first["storage"]["objectId"]);
  block_generation(&state.directory).await;
  let hit = importer.file(&path, "image").await.unwrap();
  assert_eq!(hit["storage"], changed["storage"]);
  assert_ne!(hit["id"], changed["id"]);
  let isolated = Importer::new(state.clone(), Arc::new(Catalog::new(state)));
  assert!(isolated.file(&path, "image").await.is_err());
  backend.shutdown().await.unwrap();
}
#[tokio::test]
async fn bytes_and_native_files_share_only_completed_derivative_metadata() {
  let (directory, backend, importer) = fixture().await;
  let state = backend.state.clone();
  let first = importer
    .bytes(png(false), "raw.png", "image")
    .await
    .unwrap();
  block_generation(&state.directory).await;
  let second = importer
    .bytes(png(false), "another.png", "image")
    .await
    .unwrap();
  let path = directory.path().join("native.png");
  tokio::fs::write(&path, png(false)).await.unwrap();
  let third = importer.file(&path, "image").await.unwrap();
  assert_eq!(first["storage"], second["storage"]);
  assert_eq!(second["storage"], third["storage"]);
  assert_eq!(second["name"], "another.png");
  assert_eq!(third["name"], "native.png");
  assert_ne!(first["id"], second["id"]);
  assert_ne!(second["id"], third["id"]);
  backend.shutdown().await.unwrap();
}
