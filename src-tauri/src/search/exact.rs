use super::{Result, SearchService, database_error, validation};
use crate::compute::{FindInput, FindMatch};
use futures_util::TryStreamExt;
use icu_segmenter::WordSegmenter;
use regex::{Regex, RegexBuilder};
use sqlx::Row;
use std::collections::HashSet;

fn count_matches(regex: &Regex, text: &str, whole_word: bool) -> usize {
  if !whole_word {
    return regex.find_iter(text).count();
  }
  // Intl.Segmenter (the previous renderer implementation) counts all word
  // boundaries, including punctuation and spaces, rather than is_word_like.
  let boundaries: HashSet<usize> = WordSegmenter::new_auto(Default::default())
    .segment_str(text)
    .collect();
  regex
    .find_iter(text)
    .filter(|found| boundaries.contains(&found.start()) && boundaries.contains(&found.end()))
    .count()
}

impl SearchService {
  /// Exact document find reads the same ephemeral rows as command search, without FTS ranking/limit.
  pub async fn find(&self, input: FindInput) -> Result<Vec<FindMatch>> {
    validation::identifier(&input.workbook_id)?;
    if input.query.len() > 4096 || input.query.contains('\0') {
      return Err("查找内容过长或无效".into());
    }
    if let Some(sheet) = &input.sheet_id {
      validation::identifier(sheet)?;
    }
    if input.query.is_empty() {
      return Ok(vec![]);
    }
    let mut reservation = self
      .find_slots
      .clone()
      .try_acquire_owned()
      .map_err(|_| "搜索队列已满，请稍后重试")?;
    let regex = RegexBuilder::new(&regex::escape(&input.query))
      .case_insensitive(!input.match_case)
      .build()
      .map_err(|_| "查找内容无效")?;
    let _operation = self.operations.lock().await;
    let ready = sqlx::query("SELECT 1 FROM workbooks WHERE id = ?")
      .bind(&input.workbook_id)
      .fetch_optional(&self.pool)
      .await
      .map_err(database_error)?;
    if ready.is_none() {
      return Err("文档搜索索引尚未就绪".into());
    }
    let mut matches = Vec::new();
    let query = sqlx::query(
      "SELECT sheet_id, topic_id, title, notes FROM content_index \
       WHERE workbook_id = ? AND (? IS NULL OR sheet_id = ?) ORDER BY rowid",
    )
    .bind(&input.workbook_id)
    .bind(&input.sheet_id)
    .bind(&input.sheet_id);
    let mut rows = query.fetch(&self.pool).try_chunks(64);
    while let Some(batch) = rows.try_next().await.map_err(|_| "内容搜索索引不可用")? {
      let expression = regex.clone();
      let (result, returned) = tokio::task::spawn_blocking(move || {
        let result = match_rows(batch, &expression, input.whole_word, input.include_notes);
        (result, reservation)
      })
      .await
      .map_err(|_| "搜索计算任务失败")?;
      reservation = returned;
      matches.extend(result?);
    }
    Ok(matches)
  }
}

fn match_rows(
  rows: Vec<sqlx::sqlite::SqliteRow>,
  regex: &Regex,
  whole_word: bool,
  include_notes: bool,
) -> Result<Vec<FindMatch>> {
  let mut matches = Vec::new();
  for row in rows {
    let sheet_id: &str = row.get("sheet_id");
    let topic_id: &str = row.get("topic_id");
    for field in ["title", "notes"] {
      if field == "notes" && !include_notes {
        continue;
      }
      let text: &str = row.get(field);
      let count = count_matches(regex, text, whole_word);
      if count > 0 {
        matches.push(FindMatch {
          sheet_id: sheet_id.into(),
          topic_id: topic_id.into(),
          field,
          text: text.into(),
          count: count.try_into().map_err(|_| "匹配次数超过限制")?,
        });
      }
    }
  }
  Ok(matches)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::search::{ContentIndexTopic, ContentIndexWorkbook, SyncContentIndex};

  fn input(query: &str) -> FindInput {
    FindInput {
      workbook_id: "workbook".into(),
      query: query.into(),
      match_case: false,
      whole_word: false,
      include_notes: true,
      sheet_id: None,
    }
  }
  async fn service(topics: Vec<ContentIndexTopic>) -> SearchService {
    let service = SearchService::new().await.unwrap();
    service
      .sync(SyncContentIndex {
        upserts: vec![ContentIndexWorkbook {
          workbook_id: "workbook".into(),
          title: "Workbook".into(),
          topics,
        }],
        retained_workbook_ids: vec!["workbook".into()],
      })
      .await
      .unwrap();
    service
  }
  fn topic(id: &str, title: &str, notes: &str) -> ContentIndexTopic {
    ContentIndexTopic {
      sheet_id: "sheet".into(),
      sheet_name: "Canvas".into(),
      topic_id: id.into(),
      title: title.into(),
      notes: notes.into(),
    }
  }

  #[tokio::test]
  async fn exact_phrase_case_fields_and_short_terms_share_index() {
    let service = service(vec![
      topic("a", "Alpha alpha scatter cat", "中文内容搜索"),
      topic("b", "a b ALPHA", "alpha notes"),
    ])
    .await;
    let matches = service.find(input("alpha")).await.unwrap();
    assert_eq!(matches.iter().map(|m| m.count).sum::<u32>(), 4);
    let mut exact = input("Alpha");
    exact.match_case = true;
    assert_eq!(service.find(exact).await.unwrap().len(), 1);
    let mut phrase = input("a b");
    phrase.include_notes = false;
    assert_eq!(service.find(phrase).await.unwrap()[0].topic_id, "b");
    let mut short = input("a");
    short.sheet_id = Some("other".into());
    assert!(service.find(short).await.unwrap().is_empty());
  }

  #[tokio::test]
  async fn whole_word_uses_dictionary_boundaries_and_does_not_cap_results() {
    let mut topics = vec![topic("chinese", "中文内容搜索 foo-bar scatter cat", "")];
    topics.extend((0..120).map(|i| topic(&format!("n{i}"), "cat", "")));
    let service = service(topics).await;
    let mut chinese = input("中文");
    chinese.whole_word = true;
    assert_eq!(service.find(chinese).await.unwrap()[0].topic_id, "chinese");
    let mut partial = input("文");
    partial.whole_word = true;
    assert!(service.find(partial).await.unwrap().is_empty());
    let mut english = input("cat");
    english.whole_word = true;
    english.include_notes = false;
    assert_eq!(service.find(english).await.unwrap().len(), 121);
    let mut embedded = input("catt");
    embedded.whole_word = true;
    assert!(service.find(embedded).await.unwrap().is_empty());
  }

  #[tokio::test]
  async fn absent_or_cleared_workbook_is_not_an_empty_result() {
    let service = SearchService::new().await.unwrap();
    assert!(service.find(input("cat")).await.is_err());
    service
      .sync(SyncContentIndex {
        upserts: vec![ContentIndexWorkbook {
          workbook_id: "workbook".into(),
          title: "Workbook".into(),
          topics: vec![],
        }],
        retained_workbook_ids: vec!["workbook".into()],
      })
      .await
      .unwrap();
    assert!(service.find(input("cat")).await.unwrap().is_empty());
    service.clear().await.unwrap();
    assert!(service.find(input("cat")).await.is_err());
  }
}
