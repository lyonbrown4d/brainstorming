use super::{MetadataStore, metadata::validate_paths};
use crate::document::Result;

impl MetadataStore {
  /// Merge under the SQLite write lock; another window cannot erase newer history.
  pub async fn remember_recent_file(&self, path: String) -> Result<Vec<String>> {
    validate_paths(std::slice::from_ref(&path))?;
    let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
    let mut paths: Vec<String> =
      sqlx::query_scalar("SELECT path FROM recent_files ORDER BY position LIMIT 11")
        .fetch_all(&mut *tx)
        .await?;
    validate_paths(&paths)?;
    paths.retain(|entry| entry != &path);
    paths.insert(0, path);
    paths.truncate(10);
    sqlx::query("DELETE FROM recent_files")
      .execute(&mut *tx)
      .await?;
    for (position, path) in paths.iter().enumerate() {
      sqlx::query("INSERT INTO recent_files (position,path) VALUES (?1,?2)")
        .bind(position as i64)
        .bind(path)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(paths)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[tokio::test]
  async fn concurrent_window_history_merges_deduplicates_bounds_and_survives_restart() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("metadata.sqlite");
    let store = MetadataStore::new(&path).await.unwrap();
    let (first, second) = tokio::join!(
      store.remember_recent_file("/maps/a.brainstorming".into()),
      store.remember_recent_file("/maps/b.brainstorming".into())
    );
    first.unwrap();
    second.unwrap();
    assert_eq!(store.recent_files().await.unwrap().len(), 2);
    for index in 0..12 {
      store
        .remember_recent_file(format!("/maps/{index}.brainstorming"))
        .await
        .unwrap();
    }
    store
      .remember_recent_file("/maps/9.brainstorming".into())
      .await
      .unwrap();
    let expected = store.recent_files().await.unwrap();
    assert_eq!(expected.len(), 10);
    assert_eq!(expected[0], "/maps/9.brainstorming");
    assert_eq!(
      expected
        .iter()
        .filter(|entry| entry.as_str() == "/maps/9.brainstorming")
        .count(),
      1
    );
    assert!(store.remember_recent_file(String::new()).await.is_err());
    store.shutdown().await.unwrap();
    let reopened = MetadataStore::new(&path).await.unwrap();
    assert_eq!(reopened.recent_files().await.unwrap(), expected);
    reopened.shutdown().await.unwrap();
  }
}
