use super::{catalog::Catalog, import::Importer};
use crate::{application::Backend, transport::ResourceBackend};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::sync::Arc;
fn png() -> Vec<u8> {
  base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==").unwrap()
}
#[tokio::test]
async fn imported_original_and_derivatives_are_distinct_authorized_objects() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().join("native"), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let catalog = Arc::new(Catalog::new(state.clone()));
  let importer = Importer::new(state.clone(), catalog.clone());
  let bytes = png();
  let expected = hex::encode(Sha256::digest(&bytes));
  let asset = importer
    .bytes(bytes.clone(), "image.png", "image")
    .await
    .unwrap();
  assert_eq!(asset["storage"]["objectId"], expected);
  assert_eq!(
    state.vault.read_range(&expected, 0, None).await.unwrap(),
    bytes
  );
  let preview = asset["storage"]["preview"]["objectId"].as_str().unwrap();
  assert_ne!(preview, expected);
  assert_eq!(catalog.info(preview).await.unwrap().mime_type, "image/webp");
  assert_eq!(
    catalog.info(&expected).await.unwrap().mime_type,
    "image/png"
  );
  let tile = catalog.tile(&expected, 0, 0, 0).await.unwrap().unwrap();
  assert_eq!(catalog.info(&tile).await.unwrap().mime_type, "image/webp");
  backend.shutdown().await.unwrap();
}
#[tokio::test]
async fn failed_decode_cannot_authorize_partial_staged_objects() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().join("native"), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let catalog = Arc::new(Catalog::new(state.clone()));
  let importer = Importer::new(state.clone(), catalog.clone());
  let mut broken = png();
  broken[45] ^= 0xff;
  let id = hex::encode(Sha256::digest(&broken));
  assert!(importer.bytes(broken, "broken.png", "image").await.is_err());
  assert!(catalog.info(&id).await.is_err());
  let output = state.directory.join("image-work");
  if output.exists() {
    assert_eq!(std::fs::read_dir(output).unwrap().count(), 0);
  }
  backend.shutdown().await.unwrap();
}
#[tokio::test]
#[ignore = "101 MiB native streaming smoke; run explicitly"]
async fn hundred_megabyte_original_is_imported_with_native_chunks() {
  let directory = tempfile::tempdir().unwrap();
  let backend = Backend::start(directory.path().join("native"), None)
    .await
    .unwrap();
  let state = backend.state.clone();
  let catalog = Arc::new(Catalog::new(state.clone()));
  let importer = Importer::new(state.clone(), catalog);
  let path = directory.path().join("large.png");
  tokio::fs::write(&path, png()).await.unwrap();
  let file = tokio::fs::OpenOptions::new()
    .write(true)
    .open(&path)
    .await
    .unwrap();
  file.set_len(101 * 1024 * 1024).await.unwrap();
  drop(file);
  let asset = importer.file(&path, "image").await.unwrap();
  assert_eq!(asset["storage"]["byteLength"], 101 * 1024 * 1024u64);
  assert_eq!(asset["storage"]["preview"]["width"], 1);
  let id = asset["storage"]["objectId"].as_str().unwrap();
  assert_eq!(
    state
      .vault
      .read_range(id, 101 * 1024 * 1024 - 16, Some(16))
      .await
      .unwrap(),
    vec![0; 16]
  );
  backend.shutdown().await.unwrap();
}

#[test]
fn signatures_distinguish_avif_video_and_audio_container_context() {
  use super::import::sniff;
  let avif = b"\0\0\0\x18ftypavif\0\0\0\0mif1avif";
  let mp4 = b"\0\0\0\x18ftypmp42\0\0\0\0isommp42";
  let m4a = b"\0\0\0\x18ftypM4A \0\0\0\0isommp42";
  assert_eq!(sniff(avif, false), "image/avif");
  assert_eq!(sniff(mp4, false), "video/mp4");
  assert_eq!(sniff(m4a, true), "audio/mp4");
  assert_eq!(sniff(m4a, false), "audio/mp4");
  let mut webm = vec![0; 257];
  webm[..4].copy_from_slice(b"\x1a\x45\xdf\xa3");
  webm[8..15].copy_from_slice(b"\x42\x82\x84webm");
  assert_eq!(sniff(&webm, false), "video/webm");
  assert_eq!(sniff(&webm, true), "audio/webm");
}
