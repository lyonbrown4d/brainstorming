use super::{
  Derivatives, ResourceSource, Result, error::invalid, pool, resource_reader, resources, schema,
};
use futures_util::future::BoxFuture;
use resources::ResourceReader;
use sqlx::{Connection, SqliteConnection};
use std::{
  path::{Path, PathBuf},
  sync::Arc,
};
use zeroize::Zeroizing;

pub struct DocumentSource {
  path: PathBuf,
  password: Zeroizing<String>,
}
impl DocumentSource {
  pub async fn new(path: impl AsRef<Path>, password: Option<&str>) -> Result<Self> {
    let path = path.as_ref().to_owned();
    let path = tokio::task::spawn_blocking(move || pool::canonical(&path))
      .await
      .map_err(|_| super::DocumentError::Worker)??;
    Ok(Self {
      path,
      password: Zeroizing::new(password.unwrap_or_default().to_owned()),
    })
  }
  async fn connection(&self) -> Result<SqliteConnection> {
    // A source read must not acquire a destination's registry gate: two
    // cross-document copies can otherwise wait on one another indefinitely.
    schema::connect(&self.path, Some(self.password.as_str()), false, true).await
  }
}
impl ResourceSource for DocumentSource {
  fn open<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<ResourceReader>> {
    Box::pin(async move { resource_reader::standalone_reader(self.connection().await?, id).await })
  }
  fn derivatives<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<Derivatives>> {
    Box::pin(async move {
      let mut db = self.connection().await?;
      let result = resources::derivatives(&mut db, id).await;
      db.close().await?;
      result
    })
  }
}

pub struct CompositeSource {
  sources: Vec<Arc<dyn ResourceSource>>,
}
impl CompositeSource {
  pub fn new(sources: Vec<Arc<dyn ResourceSource>>) -> Self {
    Self { sources }
  }
}
impl ResourceSource for CompositeSource {
  fn open<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<ResourceReader>> {
    Box::pin(async move {
      for source in &self.sources {
        if let Ok(reader) = source.open(id).await {
          return Ok(reader);
        }
      }
      Err(invalid("资源对象来源不可用"))
    })
  }
  fn derivatives<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<Derivatives>> {
    Box::pin(async move {
      for source in &self.sources {
        if source.open(id).await.is_ok() {
          return source.derivatives(id).await;
        }
      }
      Err(invalid("资源派生对象来源不可用"))
    })
  }
}
