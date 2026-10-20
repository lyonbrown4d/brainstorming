use brainstorming_native::editor_engine::EditorEngine;
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

#[tokio::test]
async fn batch_is_atomic_and_undoes_as_one_step() {
  let engine = EditorEngine::default();
  engine.open("one".into(), workbook()).await.unwrap();
  let operation = json!({"kind":"topic","sheetId":"sheet-a","command":{
    "type":"batch","commands":[
      {"type":"addTopic","parentId":"root","id":"a","title":"A"},
      {"type":"batch","commands":[{"type":"addTopic","parentId":"a","id":"b","title":"B"}]}
    ]
  }});
  let result = engine.execute("one", 0, operation).await.unwrap();
  assert_eq!(result.revision, 1);
  assert_eq!(
    result.workbook["sheets"][0]["document"]["topics"]["a"]["children"],
    json!(["b"])
  );
  let undone = engine
    .execute("one", 1, json!({"kind":"undo"}))
    .await
    .unwrap();
  assert_eq!(undone.revision, 2);
  assert!(
    undone.workbook["sheets"][0]["document"]["topics"]
      .get("a")
      .is_none()
  );
  let redone = engine
    .execute("one", 2, json!({"kind":"redo"}))
    .await
    .unwrap();
  assert!(
    redone.workbook["sheets"][0]["document"]["topics"]
      .get("b")
      .is_some()
  );
}

#[tokio::test]
async fn failure_and_conflict_leave_session_unchanged() {
  let engine = EditorEngine::default();
  engine.open("one".into(), workbook()).await.unwrap();
  let operation = json!({"kind":"topic","sheetId":"sheet-a","command":{
    "type":"batch","commands":[
      {"type":"addTopic","parentId":"root","id":"a","title":"A"},
      {"type":"addTopic","parentId":"missing","id":"b","title":"B"}
    ]
  }});
  assert!(engine.execute("one", 0, operation).await.is_err());
  assert_eq!(engine.snapshot("one").await.unwrap().revision, 0);
  assert!(
    engine
      .execute("one", 1, json!({"kind":"undo"}))
      .await
      .is_err()
  );
  assert_eq!(engine.snapshot("one").await.unwrap().workbook, workbook());
}

#[tokio::test]
async fn workbook_history_is_shared_across_sheets_and_sessions_are_isolated() {
  let engine = EditorEngine::default();
  engine.open("one".into(), workbook()).await.unwrap();
  engine.open("two".into(), workbook()).await.unwrap();
  let added = engine
    .execute(
      "one",
      0,
      json!({"kind":"workbook","command":{
        "type":"duplicateSheet","sheetId":"sheet-a","id":"sheet-b"
      }}),
    )
    .await
    .unwrap();
  assert_eq!(added.workbook["sheets"].as_array().unwrap().len(), 2);
  assert_eq!(
    engine.snapshot("two").await.unwrap().workbook["sheets"]
      .as_array()
      .unwrap()
      .len(),
    1
  );
  let reopened = engine.open("one".into(), workbook()).await.unwrap();
  assert_eq!(reopened.revision, 1);
  assert!(
    engine
      .open(
        "one".into(),
        json!({"format":"brainstorming","version":2,"id":"other","title":"X","sheets":[]})
      )
      .await
      .is_err()
  );
}

#[tokio::test]
async fn floating_topic_attaches_to_tree_and_can_undo() {
  let engine = EditorEngine::default();
  engine.open("floating".into(), workbook()).await.unwrap();
  let added = engine
    .execute(
      "floating",
      0,
      json!({"kind":"topic","sheetId":"sheet-a","command":{
        "type":"addFloatingTopic","id":"idea","title":"Idea","x":100,"y":200
      }}),
    )
    .await
    .unwrap();
  assert_eq!(
    added.workbook["sheets"][0]["document"]["floatingIds"],
    json!(["idea"])
  );
  let attached = engine
    .execute(
      "floating",
      1,
      json!({"kind":"topic","sheetId":"sheet-a","command":{
        "type":"attachFloatingTopic","topicId":"idea","parentId":"root"
      }}),
    )
    .await
    .unwrap();
  assert_eq!(
    attached.workbook["sheets"][0]["document"]["floatingIds"],
    json!([])
  );
  let undone = engine
    .execute("floating", 2, json!({"kind":"undo"}))
    .await
    .unwrap();
  assert_eq!(
    undone.workbook["sheets"][0]["document"]["floatingIds"],
    json!(["idea"])
  );
}

#[tokio::test]
async fn deleting_summary_sources_shrinks_range_then_removes_summary_subtree() {
  let engine = EditorEngine::default();
  engine.open("summary".into(), workbook()).await.unwrap();
  let result = engine.execute("summary", 0, json!({"kind":"topic","sheetId":"sheet-a","command":{
    "type":"batch","commands":[
      {"type":"addTopic","parentId":"root","id":"a","title":"A","side":"right"},
      {"type":"addTopic","parentId":"root","id":"b","title":"B","side":"right"},
      {"type":"addTopic","parentId":"root","id":"sum","title":"Summary","side":"right"},
      {"type":"upsertGroup","group":{"id":"group","kind":"summary","topicIds":["a","b"],"summaryTopicId":"sum"}}
    ]
  }})).await.unwrap();
  assert_eq!(result.revision, 1);
  let deleted = engine
    .execute(
      "summary",
      1,
      json!({"kind":"topic","sheetId":"sheet-a","command":{
        "type":"deleteTopic","topicId":"a"
      }}),
    )
    .await
    .unwrap();
  let topics = &deleted.workbook["sheets"][0]["document"]["topics"];
  assert!(topics.get("a").is_none());
  assert!(topics.get("sum").is_some());
  assert!(topics.get("b").is_some());
  assert_eq!(
    deleted.workbook["sheets"][0]["document"]["groups"][0]["topicIds"],
    json!(["b"])
  );
  let empty = engine
    .execute(
      "summary",
      2,
      json!({"kind":"topic", "sheetId":"sheet-a", "command":{
        "type":"deleteTopic", "topicId":"b"
      }}),
    )
    .await
    .unwrap();
  assert!(
    empty.workbook["sheets"][0]["document"]["topics"]
      .get("sum")
      .is_none()
  );
}

#[tokio::test]
async fn clear_resets_sessions_and_shutdown_closes_admission() {
  let engine = EditorEngine::default();
  engine.open("one".into(), workbook()).await.unwrap();
  engine.clear().await.unwrap();
  assert!(engine.snapshot("one").await.is_err());
  let reopened = engine.open("one".into(), workbook()).await.unwrap();
  assert_eq!(reopened.revision, 0);
  engine.shutdown().await.unwrap();
  assert!(engine.open("two".into(), workbook()).await.is_err());
  assert!(engine.snapshot("one").await.is_err());
  assert!(engine.close("one").await.is_err());
  assert!(engine.clear().await.is_err());
}

#[tokio::test]
async fn whole_word_replacement_uses_the_same_chinese_dictionary_as_find() {
  let engine = EditorEngine::default();
  let mut book = workbook();
  book["sheets"][0]["document"]["topics"]["root"]["title"] = json!("中文内容搜索 文 foo-bar");
  book["sheets"][0]["document"]["title"] = json!("中文内容搜索 文 foo-bar");
  engine.open("chinese".into(), book).await.unwrap();
  let replaced = engine.execute("chinese", 0, json!({
    "kind":"topic", "sheetId":"sheet-a", "command":{
      "type":"replaceTopicText", "topicId":"root", "query":"中文", "replacement":"汉语", "wholeWord":true
    }
  })).await.unwrap();
  assert_eq!(
    replaced.workbook["sheets"][0]["document"]["title"],
    "汉语内容搜索 文 foo-bar"
  );
  let partial = engine.execute("chinese", 1, json!({
    "kind":"topic", "sheetId":"sheet-a", "command":{
      "type":"replaceTopicText", "topicId":"root", "query":"语", "replacement":"X", "wholeWord":true
    }
  })).await.unwrap();
  assert_eq!(partial.revision, 1);
}

#[tokio::test]
async fn cyclic_clipboard_fails_without_mutating_the_document() {
  let engine = EditorEngine::default();
  engine.open("paste".into(), workbook()).await.unwrap();
  let result = engine.execute("paste", 0, json!({
    "kind":"topic", "sheetId":"sheet-a", "command":{
      "type":"pasteTopics", "parentId":"root", "topicIds":{"a":"copy"}, "assetIds":{}, "annotationIds":{},
      "clipboard":{
        "format":"brainstorming.topics", "version":1, "roots":["a"],
        "topics":{"a":{"id":"a","title":"A","children":["a"],"collapsed":false,"side":"right"}}
      }
    }
  })).await;
  assert!(result.err().unwrap().contains("循环"));
  assert_eq!(engine.snapshot("paste").await.unwrap().workbook, workbook());
}

#[tokio::test]
async fn deleting_cross_linked_topic_cleans_links_and_undo_restores_both() {
  let engine = EditorEngine::default();
  let mut book = workbook();
  book["sheets"][0]["document"]["topics"]["root"]["children"] = json!(["target"]);
  book["sheets"][0]["document"]["topics"]["target"] = json!({
    "id":"target","title":"Target","children":[],"collapsed":false,"side":"right"
  });
  let mut other = workbook()["sheets"][0].clone();
  other["id"] = json!("other");
  other["document"]["id"] = json!("other");
  other["document"]["topics"]["root"]["metadata"] = json!({"link":{
    "kind":"topic", "sheetId":"sheet-a", "topicId":"target"
  }});
  book["sheets"].as_array_mut().unwrap().push(other);
  engine.open("links".into(), book.clone()).await.unwrap();
  let deleted = engine
    .execute(
      "links",
      0,
      json!({"kind":"topic", "sheetId":"sheet-a", "command":{
        "type":"deleteTopic", "topicId":"target"
      }}),
    )
    .await
    .unwrap();
  assert!(
    deleted.workbook["sheets"][1]["document"]["topics"]["root"]["metadata"]
      .get("link")
      .is_none()
  );
  let undone = engine
    .execute("links", 1, json!({"kind":"undo"}))
    .await
    .unwrap();
  assert_eq!(undone.workbook, book);
}
