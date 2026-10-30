use super::*;

fn workbook(id: &str, count: usize, notes: &str) -> ContentIndexWorkbook {
  ContentIndexWorkbook {
    workbook_id: id.into(),
    title: id.into(),
    topics: (0..count)
      .map(|i| ContentIndexTopic {
        sheet_id: "sheet".into(),
        sheet_name: "Canvas".into(),
        topic_id: i.to_string(),
        title: format!("content-{id}"),
        notes: notes.into(),
      })
      .collect(),
  }
}
fn batch(upserts: Vec<ContentIndexWorkbook>, retained: &[&str]) -> SyncContentIndex {
  SyncContentIndex {
    upserts,
    retained_workbook_ids: retained.iter().map(|id| id.to_string()).collect(),
  }
}

#[test]
fn input_bounds_reject_oversized_batches_and_text_without_truncation() {
  assert!(validation::validate(&batch(vec![workbook("a", 20_001, "")], &["a"])).is_err());
  let ids: Vec<String> = (0..33).map(|i| i.to_string()).collect();
  assert!(
    validation::validate(&SyncContentIndex {
      upserts: vec![],
      retained_workbook_ids: ids
    })
    .is_err()
  );
  assert!(validation::validate(&batch(vec![], &["a", "a"])).is_err());
  assert!(validation::validate(&batch(vec![], &["\0"])).is_err());
  let mut excessive_title = workbook("a", 1, "");
  excessive_title.topics[0].title = "a".repeat(2_048_001);
  assert!(validation::validate(&batch(vec![excessive_title], &["a"])).is_err());
  // Every individual notes field is valid; aggregate text must still be bounded.
  let excessive_text = workbook("a", 1_350, &"a".repeat(100_000));
  assert!(validation::validate(&batch(vec![excessive_text], &["a"])).is_err());
}

#[tokio::test]
async fn incremental_sync_cannot_bypass_the_global_topic_cap_or_partially_prune() {
  let service = SearchService::new().await.unwrap();
  let ids = ["a", "b", "c", "d", "e"];
  service
    .sync(batch(
      ids.iter().map(|id| workbook(id, 20_000, "")).collect(),
      &ids,
    ))
    .await
    .unwrap();
  assert!(
    service
      .sync(batch(
        vec![workbook("new", 1, "")],
        &["a", "b", "c", "d", "e", "new"]
      ))
      .await
      .is_err()
  );
  let query = |text: &str| SearchContent {
    query: text.into(),
    limit: None,
  };
  assert!(
    service
      .search(query("content-new"))
      .await
      .unwrap()
      .is_empty()
  );
  assert_eq!(service.search(query("content-a")).await.unwrap().len(), 30);
  service
    .sync(batch(vec![workbook("new", 1, "")], &["new"]))
    .await
    .unwrap();
  assert!(service.search(query("content-a")).await.unwrap().is_empty());
  assert_eq!(service.search(query("content-new")).await.unwrap().len(), 1);
  service.shutdown().await;
}

#[tokio::test]
async fn result_labels_and_snippets_are_bounded_without_losing_tail_matches() {
  let service = SearchService::new().await.unwrap();
  let mut content = workbook("a", 1, "");
  content.title = "文".repeat(1_000);
  content.topics[0].title = format!("{}tailneedle", "题".repeat(2_000));
  service.sync(batch(vec![content], &["a"])).await.unwrap();
  let results = service
    .search(SearchContent {
      query: "tailneedle".into(),
      limit: None,
    })
    .await
    .unwrap();
  assert_eq!(results[0].title.chars().count(), 240);
  assert_eq!(results[0].workbook_title.chars().count(), 240);
  assert!(results[0].snippet.contains("tailneedle"));
  assert!(results[0].snippet.chars().count() <= 162);
  assert_eq!(results[0].workbook_id, "a");
  service.shutdown().await;
}
