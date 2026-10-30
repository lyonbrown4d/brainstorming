use brainstorming_engine::editor_engine::EditorEngine;
use serde_json::{Value, json};

fn workbook() -> Value {
  json!({
    "format":"brainstorming", "version":2, "id":"book", "title":"Map",
    "sheets":[{"id":"sheet-a","name":"Main","document":{
      "format":"brainstorming","version":1,"id":"sheet-a","title":"Root","rootId":"root",
      "topics":{"root":{"id":"root","title":"Root","children":[],"collapsed":false,"side":"right"}}
    }}]
  })
}

#[tokio::test]
async fn topic_scale_command_preserves_value_and_rejects_invalid_change() {
  let engine = EditorEngine::default();
  engine.open("scale".into(), workbook()).await.unwrap();
  let operation = |scale: Value| {
    json!({
      "kind":"topic","sheetId":"sheet-a","command":{
        "type":"setTopicStyle","topicId":"root","style":{"scale":scale}
      }
    })
  };
  let scaled = engine
    .execute("scale", 0, operation(json!(1.5)))
    .await
    .unwrap();
  assert_eq!(
    scaled.workbook["sheets"][0]["document"]["topics"]["root"]["style"]["scale"],
    1.5
  );
  assert!(
    engine
      .execute("scale", 1, operation(json!(4)))
      .await
      .is_err()
  );
  assert_eq!(
    engine.snapshot("scale").await.unwrap().workbook,
    scaled.workbook
  );
}

#[tokio::test]
async fn pasted_topic_preserves_scale() {
  let engine = EditorEngine::default();
  engine
    .open("scaled-paste".into(), workbook())
    .await
    .unwrap();
  let result = engine
    .execute(
      "scaled-paste",
      0,
      json!({
        "kind":"topic", "sheetId":"sheet-a", "command":{
          "type":"pasteTopics", "parentId":"root", "topicIds":{"source":"copy"},
          "assetIds":{}, "annotationIds":{},
          "clipboard":{
            "format":"brainstorming.topics", "version":1, "roots":["source"],
            "topics":{"source":{"id":"source","title":"Scaled","children":[],
              "collapsed":false,"side":"right","style":{"scale":1.5}}}
          }
        }
      }),
    )
    .await
    .unwrap();
  assert_eq!(
    result.workbook["sheets"][0]["document"]["topics"]["copy"]["style"]["scale"],
    1.5
  );
}
