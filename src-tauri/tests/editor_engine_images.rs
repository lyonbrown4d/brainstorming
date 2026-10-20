use base64::{Engine, engine::general_purpose::STANDARD};
use brainstorming_native::{document::validate_workbook, editor_engine::EditorEngine};
use serde_json::{Value, json};

fn workbook() -> Value {
  json!({
    "format":"brainstorming", "version":2, "id":"book", "title":"Map",
    "sheets":[{
      "id":"sheet-a", "name":"Main",
      "document":{
        "format":"brainstorming", "version":1, "id":"sheet-a", "title":"Root", "rootId":"root",
        "topics":{"root":{"id":"root","title":"Root","children":[],"collapsed":false,"side":"right"}}
      }
    }]
  })
}

fn image_command(width: Value, height: Value) -> Value {
  let png = include_bytes!("../../tests/fixtures/xmind/pixel image.png");
  json!({"kind":"topic","sheetId":"sheet-a","command":{
    "type":"setTopicImage","topicId":"root","width":width,"height":height,
    "asset":{"id":"pixel","name":"pixel.png","mimeType":"image/png","data":STANDARD.encode(png)}
  }})
}

#[tokio::test]
async fn inserted_image_keeps_integer_dimensions_through_undo_and_redo() {
  let engine = EditorEngine::default();
  engine.open("image".into(), workbook()).await.unwrap();

  let inserted = engine
    .execute("image", 0, image_command(json!(1), json!(1)))
    .await
    .unwrap();
  let image = &inserted.workbook["sheets"][0]["document"]["topics"]["root"]["image"];
  assert_eq!(image["assetId"], "pixel");
  assert_eq!(image["width"].as_u64(), Some(1));
  assert_eq!(image["height"].as_u64(), Some(1));
  validate_workbook(&inserted.workbook).unwrap();
  assert_eq!(inserted.revision, 1);

  let undone = engine
    .execute("image", 1, json!({"kind":"undo"}))
    .await
    .unwrap();
  assert!(
    undone.workbook["sheets"][0]["document"]["topics"]["root"]
      .get("image")
      .is_none()
  );
  let redone = engine
    .execute("image", 2, json!({"kind":"redo"}))
    .await
    .unwrap();
  let image = &redone.workbook["sheets"][0]["document"]["topics"]["root"]["image"];
  assert_eq!(image["width"].as_u64(), Some(1));
  assert_eq!(image["height"].as_u64(), Some(1));
  validate_workbook(&redone.workbook).unwrap();
}

#[tokio::test]
async fn invalid_image_dimensions_do_not_change_native_history() {
  let engine = EditorEngine::default();
  let original = workbook();
  engine
    .open("invalid-image".into(), original.clone())
    .await
    .unwrap();

  for (width, height) in [
    (json!(1.5), json!(1)),
    (json!(0), json!(1)),
    (json!(65_537), json!(1)),
    (json!(16_385), json!(16_385)),
  ] {
    assert!(
      engine
        .execute("invalid-image", 0, image_command(width, height))
        .await
        .is_err()
    );
    let snapshot = engine.snapshot("invalid-image").await.unwrap();
    assert_eq!(snapshot.revision, 0);
    assert_eq!(snapshot.workbook, original);
    assert!(!snapshot.can_undo);
  }
}
