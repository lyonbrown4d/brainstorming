use super::*;

fn workbook(id: &str, title: &str, notes: &str) -> ContentIndexWorkbook {
    ContentIndexWorkbook {
        workbook_id: id.into(),
        title: format!("Workbook {id}"),
        topics: vec![ContentIndexTopic {
            sheet_id: "sheet".into(),
            sheet_name: "Canvas".into(),
            topic_id: "topic".into(),
            title: title.into(),
            notes: notes.into(),
        }],
    }
}
async fn sync(service: &SearchService, upserts: Vec<ContentIndexWorkbook>, retained: &[&str]) {
    service
        .sync(SyncContentIndex {
            upserts,
            retained_workbook_ids: retained.iter().map(|id| id.to_string()).collect(),
        })
        .await
        .unwrap();
}
async fn search(service: &SearchService, query: &str) -> Vec<ContentSearchResult> {
    service
        .search(SearchContent {
            query: query.into(),
            limit: None,
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn real_fts_trigram_matches_english_chinese_and_short_terms_across_fields() {
    let service = SearchService::new().await.unwrap();
    sync(
        &service,
        vec![
            workbook("a", "Release planning", "中文内容搜索与研发计划"),
            workbook("b", "Other topic", "Release planning in notes"),
            workbook("c", "中文内", "no match"),
        ],
        &["a", "b", "c"],
    )
    .await;
    let results = search(&service, "release PLANNING").await;
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].workbook_id, "a", "title hits rank above notes");
    assert_eq!(search(&service, "内容搜索").await[0].workbook_id, "a");
    assert_eq!(search(&service, "中文").await.len(), 2);
    assert_eq!(search(&service, "研").await[0].workbook_id, "a");
    assert_eq!(search(&service, "release 研").await[0].workbook_id, "a");
    assert!(search(&service, "release missing").await.is_empty());
    assert!(search(&service, "  \t ").await.is_empty());
    service.shutdown().await;
}

#[tokio::test]
async fn identities_snippets_and_replacement_prune_clear_follow_the_batch_snapshot() {
    let service = SearchService::new().await.unwrap();
    let mut first = workbook(
        "a",
        "<b>Shared title</b>",
        &format!("{}needle{}", "İ".repeat(300), "尾".repeat(300)),
    );
    let mut sibling = first.topics[0].clone();
    sibling.sheet_id = "second".into();
    sibling.sheet_name = "Second sheet".into();
    first.topics.push(sibling);
    sync(
        &service,
        vec![first, workbook("b", "Shared title", "")],
        &["a", "b"],
    )
    .await;
    let results = search(&service, "shared").await;
    assert_eq!(results.len(), 3);
    assert!(
        results
            .iter()
            .any(|r| r.sheet_id == "second" && r.sheet_name == "Second sheet")
    );
    let from_a = results
        .iter()
        .find(|result| result.workbook_id == "a")
        .unwrap();
    assert_eq!(from_a.workbook_title, "Workbook a");
    assert_eq!(results[0].topic_id, "topic");
    let snippets = search(&service, "needle").await;
    assert!(snippets[0].snippet.contains("needle"));
    assert!(snippets[0].snippet.chars().count() <= 162);
    assert!(snippets[0].snippet.starts_with('…'));
    // Existing markup is returned as literal text, never generated highlight HTML.
    assert_eq!(from_a.title, "<b>Shared title</b>");
    sync(
        &service,
        vec![workbook("a", "Updated unsaved text", "")],
        &["a", "b"],
    )
    .await;
    assert_eq!(search(&service, "shared").await.len(), 1);
    assert_eq!(search(&service, "updated").await.len(), 1);
    sync(&service, vec![], &["a"]).await;
    assert!(search(&service, "shared").await.is_empty());
    sync(
        &service,
        vec![ContentIndexWorkbook {
            workbook_id: "a".into(),
            title: "Empty".into(),
            topics: vec![],
        }],
        &["a"],
    )
    .await;
    assert!(search(&service, "updated").await.is_empty());
    sync(&service, vec![workbook("a", "Secret", "")], &["a"]).await;
    service.clear().await.unwrap();
    assert!(search(&service, "secret").await.is_empty());
    service.shutdown().await;
    assert!(
        service
            .search(SearchContent {
                query: "secret".into(),
                limit: None
            })
            .await
            .is_err()
    );
}

#[tokio::test]
async fn fts_operators_and_quotes_are_literal_and_limits_are_enforced() {
    let service = SearchService::new().await.unwrap();
    sync(
        &service,
        vec![workbook(
            "a",
            "special \"literal\" OR NEAR(foo) -notes:*",
            "",
        )],
        &["a"],
    )
    .await;
    for query in ["\"literal\"", "NEAR(foo)", "-notes:*", "\"\"\"", "OR", "*"] {
        let _ = search(&service, query).await;
    }
    assert!(search(&service, "special OR missing").await.is_empty());
    for input in [
        SearchContent {
            query: "a".repeat(257),
            limit: None,
        },
        SearchContent {
            query: "ok\0bad".into(),
            limit: None,
        },
        SearchContent {
            query: "special".into(),
            limit: Some(0),
        },
        SearchContent {
            query: "special".into(),
            limit: Some(101),
        },
    ] {
        assert!(service.search(input).await.is_err());
    }
    let mut many = workbook("many", "same", "");
    many.topics = (0..105)
        .map(|i| {
            let mut topic = many.topics[0].clone();
            topic.topic_id = i.to_string();
            topic
        })
        .collect();
    sync(&service, vec![many], &["many"]).await;
    assert_eq!(search(&service, "same").await.len(), 30);
    assert_eq!(
        service
            .search(SearchContent {
                query: "same".into(),
                limit: Some(100)
            })
            .await
            .unwrap()
            .len(),
        100
    );
}

#[tokio::test]
async fn invalid_sync_never_replaces_or_prunes_existing_content() {
    let service = SearchService::new().await.unwrap();
    sync(&service, vec![workbook("old", "Preserved", "")], &["old"]).await;
    let mut duplicate = workbook("new", "New", "");
    duplicate.topics.push(duplicate.topics[0].clone());
    let mut too_long = workbook("new", "New", &"a".repeat(100_001));
    let mut inconsistent = workbook("new", "New", "");
    let mut topic = inconsistent.topics[0].clone();
    topic.topic_id = "another".into();
    topic.sheet_name = "Different".into();
    inconsistent.topics.push(topic);
    for upserts in [
        vec![duplicate],
        vec![too_long.clone()],
        vec![inconsistent],
        vec![workbook("excluded", "New", "")],
        vec![workbook("new", "New", ""), workbook("new", "New", "")],
    ] {
        assert!(
            service
                .sync(SyncContentIndex {
                    upserts,
                    retained_workbook_ids: vec!["new".into()]
                })
                .await
                .is_err()
        );
        assert_eq!(search(&service, "preserved").await.len(), 1);
        assert!(search(&service, "new").await.is_empty());
    }
    // The actual notes boundary counts UTF-16 units, matching core validation.
    too_long.topics[0].notes = "😀".repeat(50_000);
    sync(&service, vec![too_long], &["new"]).await;
    assert!(search(&service, "preserved").await.is_empty());
    service.shutdown().await;
}
