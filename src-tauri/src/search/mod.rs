#[cfg(test)]
mod bounds_tests;
mod exact;
mod model;
mod query;
#[cfg(test)]
mod tests;
mod validation;

pub use model::*;
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool, sqlite::SqlitePoolOptions};
use std::{collections::HashSet, sync::Arc};
use tokio::sync::{Mutex, Semaphore};

type Result<T> = std::result::Result<T, String>;

/// A process-local index of open, unlocked documents. Never opens document paths.
pub struct SearchService {
  pool: SqlitePool,
  // Serialize batches, searches and renderer resets to guarantee full snapshots.
  operations: Mutex<()>,
  // One executing and one waiting exact search; permits also cover cancelled CPU batches.
  find_slots: Arc<Semaphore>,
}
impl SearchService {
  pub async fn new() -> Result<Self> {
    let pool = SqlitePoolOptions::new()
      .max_connections(1)
      .connect("sqlite::memory:")
      .await
      .map_err(database_error)?;
    let initialize = sqlx::raw_sql(
            "PRAGMA temp_store = MEMORY; PRAGMA secure_delete = ON;
             CREATE TABLE workbooks (id TEXT PRIMARY KEY, title TEXT NOT NULL, bytes INTEGER NOT NULL, topics INTEGER NOT NULL);
             CREATE VIRTUAL TABLE content_index USING fts5(
               workbook_id UNINDEXED, sheet_id UNINDEXED,
               sheet_name UNINDEXED, topic_id UNINDEXED, title, notes,
               title_fold UNINDEXED, notes_fold UNINDEXED, tokenize='trigram');
             INSERT INTO content_index(content_index, rank) VALUES ('secure-delete', 1);",
        )
        .execute(&pool)
        .await;
    if let Err(error) = initialize {
      pool.close().await;
      return Err(database_error(error));
    }
    Ok(Self {
      pool,
      operations: Mutex::new(()),
      find_slots: Arc::new(Semaphore::new(2)),
    })
  }
  pub async fn sync(&self, input: SyncContentIndex) -> Result<()> {
    let totals = validation::validate(&input)?;
    let _operation = self.operations.lock().await;
    let mut transaction = self.pool.begin().await.map_err(database_error)?;
    let retained: HashSet<&str> = input
      .retained_workbook_ids
      .iter()
      .map(String::as_str)
      .collect();
    let replaced: HashSet<&str> = input
      .upserts
      .iter()
      .map(|w| w.workbook_id.as_str())
      .collect();
    let existing = sqlx::query("SELECT id, bytes, topics FROM workbooks")
      .fetch_all(&mut *transaction)
      .await
      .map_err(database_error)?;
    let (mut bytes, mut count): (usize, usize) = totals
      .iter()
      .copied()
      .fold((0, 0), |(a, b), (c, d)| (a + c, b + d));
    for row in &existing {
      let id: &str = row.get("id");
      if retained.contains(id) && !replaced.contains(id) {
        bytes += row.get::<i64, _>("bytes") as usize;
        count += row.get::<i64, _>("topics") as usize;
      }
    }
    if bytes > validation::MAX_TEXT || count > validation::MAX_TOPICS {
      return Err("搜索索引超过 128 MiB 或 100000 个主题限制".into());
    }
    for row in existing {
      let id: &str = row.get("id");
      if !retained.contains(id) || replaced.contains(id) {
        sqlx::query("DELETE FROM content_index WHERE workbook_id = ?")
          .bind(id)
          .execute(&mut *transaction)
          .await
          .map_err(database_error)?;
        sqlx::query("DELETE FROM workbooks WHERE id = ?")
          .bind(id)
          .execute(&mut *transaction)
          .await
          .map_err(database_error)?;
      }
    }
    for (workbook, (bytes, count)) in input.upserts.into_iter().zip(totals) {
      sqlx::query("INSERT INTO workbooks VALUES (?, ?, ?, ?)")
        .bind(&workbook.workbook_id)
        .bind(&workbook.title)
        .bind(bytes as i64)
        .bind(count as i64)
        .execute(&mut *transaction)
        .await
        .map_err(database_error)?;
      // Stay below SQLite's smallest common variable limit and avoid a round trip per topic.
      for topics in workbook.topics.chunks(100) {
        let mut insert = QueryBuilder::<Sqlite>::new("INSERT INTO content_index ");
        insert.push_values(topics, |mut row, topic| {
          row
            .push_bind(&workbook.workbook_id)
            .push_bind(&topic.sheet_id)
            .push_bind(&topic.sheet_name)
            .push_bind(&topic.topic_id)
            .push_bind(&topic.title)
            .push_bind(&topic.notes)
            .push_bind(topic.title.to_lowercase())
            .push_bind(topic.notes.to_lowercase());
        });
        insert
          .build()
          .execute(&mut *transaction)
          .await
          .map_err(database_error)?;
      }
    }
    transaction.commit().await.map_err(database_error)
  }
  pub async fn clear(&self) -> Result<()> {
    let _operation = self.operations.lock().await;
    let mut transaction = self.pool.begin().await.map_err(database_error)?;
    sqlx::query("DELETE FROM content_index")
      .execute(&mut *transaction)
      .await
      .map_err(database_error)?;
    sqlx::query("DELETE FROM workbooks")
      .execute(&mut *transaction)
      .await
      .map_err(database_error)?;
    transaction.commit().await.map_err(database_error)?;
    Ok(())
  }
  pub async fn shutdown(&self) {
    self.find_slots.close();
    let _operation = self.operations.lock().await;
    self.pool.close().await;
  }
}
fn database_error(_: sqlx::Error) -> String {
  // SQLite errors can contain search text; keep document content out of IPC errors.
  "内容搜索索引不可用".into()
}
