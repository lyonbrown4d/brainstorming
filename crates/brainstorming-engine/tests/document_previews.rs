#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_engine::document::{DocumentStore, SheetPreview, preview_reader};
use serde_json::json;
use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};

fn image(sheet: &str) -> SheetPreview {
  let mut png = Vec::new();
  {
    let mut encoder = png::Encoder::new(&mut png, 2, 1);
    encoder.set_color(png::ColorType::Rgba);
    let mut writer = encoder.write_header().unwrap();
    writer
      .write_image_data(&[255, 0, 0, 255, 0, 255, 0, 255])
      .unwrap();
    writer.finish().unwrap();
  }
  SheetPreview {
    sheet_id: sheet.to_string(),
    png,
  }
}

#[tokio::test]
async fn previews_are_atomic_revision_bound_and_cover_specific() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("preview.brainstorming");
  let store = DocumentStore::new();
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["relations"][0]["routing"] = json!("curve");
  workbook["sheets"][0]["document"]["relations"][0]["controlPoints"] =
    json!([{"x":10,"y":-20},{"x":20,"y":40}]);
  workbook["sheets"][0]["document"]["relations"][0]["labelOffset"] = json!({"x":0,"y":30});
  workbook["sheets"][0]["document"]["relations"][0]["sourceAnchor"] = json!("right");
  workbook["sheets"][0]["document"]["relations"][0]["targetAnchor"] = json!("left");
  store
    .write(&path, workbook.clone(), None, None, None)
    .await
    .unwrap();
  assert_eq!(store.read(&path, None).await.unwrap(), workbook);
  let revision = store
    .preview_revision(&path, &workbook, None)
    .await
    .unwrap()
    .unwrap();
  assert!(
    store
      .write_previews(
        &path,
        revision.clone(),
        "sheet-b".into(),
        vec![image("sheet-a"), image("sheet-b")],
        None
      )
      .await
      .unwrap()
  );
  let cover = preview_reader::read(&path, true).await.unwrap();
  assert_eq!(cover.len(), 1);
  assert_eq!(cover[0].sheet_id, "sheet-b");
  assert_eq!((cover[0].width, cover[0].height), (2, 1));
  assert_eq!(preview_reader::read(&path, false).await.unwrap().len(), 2);
  let mut invalid = image("sheet-a");
  invalid.png.truncate(invalid.png.len() - 5);
  assert!(
    store
      .write_previews(
        &path,
        revision.clone(),
        "sheet-a".into(),
        vec![invalid],
        None
      )
      .await
      .is_err()
  );
  assert_eq!(
    preview_reader::read(&path, true).await.unwrap()[0].sheet_id,
    "sheet-b"
  );
  assert!(
    store
      .write_previews(
        &path,
        revision.clone(),
        "not-a-sheet".into(),
        vec![image("not-a-sheet")],
        None
      )
      .await
      .is_err()
  );
  let mut edited = workbook.clone();
  edited["sheets"][0]["document"]["topics"]["a"]["title"] = json!("edited while PNG renders");
  store.write(&path, edited, None, None, None).await.unwrap();
  assert!(
    store
      .preview_revision(&path, &workbook, None)
      .await
      .unwrap()
      .is_none()
  );
  assert!(
    !store
      .write_previews(
        &path,
        revision,
        "sheet-a".into(),
        vec![image("sheet-a")],
        None
      )
      .await
      .unwrap()
  );
  assert!(preview_reader::read(&path, false).await.unwrap().is_empty());
}

#[tokio::test]
async fn normalized_media_hash_and_encryption_keep_previews_inside_the_file() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("media.brainstorming");
  let store = DocumentStore::new();
  let mut input = fixture::workbook();
  input["sheets"][0]["document"]["assets"] = json!({"file":{"id":"file","name":"file.txt","mimeType":"application/octet-stream","data":"aGVsbG8="}});
  input["sheets"][0]["document"]["topics"]["a"]["attachments"] = json!(["file"]);
  let saved = store
    .write(&path, input.clone(), None, None, None)
    .await
    .unwrap();
  assert_ne!(saved, input);
  let revision = store
    .preview_revision(&path, &input, None)
    .await
    .unwrap()
    .unwrap();
  assert_eq!(
    store.preview_revision(&path, &saved, None).await.unwrap(),
    Some(revision.clone())
  );
  assert!(
    store
      .write_previews(
        &path,
        revision,
        "sheet-a".into(),
        vec![image("sheet-a")],
        None
      )
      .await
      .unwrap()
  );
  store
    .rekey(&path, None, Some("protected-secret"))
    .await
    .unwrap();
  assert!(preview_reader::read(&path, true).await.is_err());
  store
    .rekey(&path, Some("protected-secret"), None)
    .await
    .unwrap();
  assert_eq!(
    preview_reader::read(&path, true).await.unwrap()[0].png,
    image("sheet-a").png
  );
  assert_eq!(store.read(&path, None).await.unwrap(), saved);
}

#[tokio::test]
async fn shell_read_does_not_migrate_or_modify_old_or_current_files() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("readonly.brainstorming");
  let store = DocumentStore::new();
  store
    .write(&path, fixture::workbook(), None, None, None)
    .await
    .unwrap();
  store.release(&path).await.unwrap();
  let before = tokio::fs::read(&path).await.unwrap();
  assert!(preview_reader::read(&path, false).await.unwrap().is_empty());
  assert_eq!(tokio::fs::read(&path).await.unwrap(), before);
  let mut db = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
    .await
    .unwrap();
  sqlx::raw_sql("DROP TABLE document_previews; DROP TABLE document_preview_state; DELETE FROM _brainstorming_migrations WHERE version=2").execute(&mut db).await.unwrap();
  db.close().await.unwrap();
  let baseline = tokio::fs::read(&path).await.unwrap();
  assert!(preview_reader::read(&path, false).await.unwrap().is_empty());
  assert_eq!(tokio::fs::read(&path).await.unwrap(), baseline);
}
