use crate::document::{self, Derivatives, ResourceObject, ResourceSource, Result};
use document::resources::ResourceReader;
use futures_util::future::BoxFuture;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::{
  io::Cursor,
  path::Path,
  sync::{Arc, Mutex},
};
use tempfile::NamedTempFile;
use tokio::sync::{OwnedRwLockReadGuard, RwLock};
use zeroize::Zeroizing;

struct VaultInner {
  pool: SqlitePool,
  lifecycle: Arc<RwLock<()>>,
  // SQLx pool.close().await completes before unlinking, including on Windows.
  file: Mutex<Option<NamedTempFile>>,
}
#[derive(Clone)]
pub struct ResourceVault {
  inner: Arc<VaultInner>,
}

impl ResourceVault {
  /// A random key exists only in native memory. Staged bytes never land in a
  /// plaintext temporary file, including before a document receives a password.
  pub async fn new(directory: impl AsRef<Path>) -> Result<Self> {
    tokio::fs::create_dir_all(directory.as_ref()).await?;
    let directory = directory.as_ref().to_owned();
    let file = tokio::task::spawn_blocking(move || NamedTempFile::new_in(directory))
      .await
      .map_err(|_| document::DocumentError::Worker)??;
    let password = Zeroizing::new(format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4()));
    let options = document::schema::options(file.path(), Some(password.as_str()), false, false)?;
    let pool = SqlitePoolOptions::new()
      .max_connections(1)
      .idle_timeout(None)
      .max_lifetime(None)
      .after_connect(|db, _| {
        Box::pin(async move {
          document::schema::authenticate(db)
            .await
            .map_err(|error| sqlx::Error::Protocol(error.to_string()))
        })
      })
      .connect_lazy_with(options);
    let initialized = async {
      let mut db = pool.acquire().await?;
      document::schema::initialize(&mut db, true).await
    }
    .await;
    if let Err(error) = initialized {
      pool.close().await;
      tokio::task::spawn_blocking(move || file.close())
        .await
        .map_err(|_| document::DocumentError::Worker)??;
      return Err(error);
    }
    Ok(Self {
      inner: Arc::new(VaultInner {
        pool,
        lifecycle: Arc::new(RwLock::new(())),
        file: Mutex::new(Some(file)),
      }),
    })
  }
  async fn lease(&self) -> Result<OwnedRwLockReadGuard<()>> {
    let lease = self.inner.lifecycle.clone().read_owned().await;
    if self.inner.pool.is_closed() {
      return Err(document::DocumentError::Invalid(
        "资源暂存服务已关闭".into(),
      ));
    }
    Ok(lease)
  }
  /// Call after producers have drained. Active streams finish before the
  /// pool closes, and all native database handles close before file deletion.
  pub async fn shutdown(&self) -> Result<()> {
    let _lease = self.inner.lifecycle.write().await;
    self.inner.pool.close().await;
    let file = self
      .inner
      .file
      .lock()
      .map_err(|_| document::DocumentError::Worker)?
      .take();
    if let Some(file) = file {
      tokio::task::spawn_blocking(move || file.close())
        .await
        .map_err(|_| document::DocumentError::Worker)??;
    }
    Ok(())
  }
  pub async fn import_file(&self, path: impl AsRef<Path>) -> Result<ResourceObject> {
    let _lease = self.lease().await?;
    let mut file = tokio::fs::File::open(path).await?;
    let mut tx = self.inner.pool.begin().await?;
    let object = document::resources::insert(&mut tx, &mut file, None).await?;
    tx.commit().await?;
    Ok(object)
  }
  pub async fn import_bytes(&self, bytes: Vec<u8>) -> Result<ResourceObject> {
    let _lease = self.lease().await?;
    let mut tx = self.inner.pool.begin().await?;
    let object = document::resources::insert(&mut tx, &mut Cursor::new(bytes), None).await?;
    tx.commit().await?;
    Ok(object)
  }
  pub async fn read_range(&self, id: &str, offset: u64, length: Option<u64>) -> Result<Vec<u8>> {
    let _lease = self.lease().await?;
    let mut db = self.inner.pool.acquire().await?;
    document::resources::read_range(&mut db, id, offset, length).await
  }
  pub async fn object_info(&self, id: &str) -> Result<ResourceObject> {
    let _lease = self.lease().await?;
    let mut db = self.inner.pool.acquire().await?;
    Ok(ResourceObject {
      byte_length: document::resources::size(&mut db, id).await?,
      object_id: id.to_owned(),
    })
  }
  pub async fn derivatives(&self, id: &str) -> Result<Derivatives> {
    let _lease = self.lease().await?;
    let mut db = self.inner.pool.acquire().await?;
    document::resources::derivatives(&mut db, id).await
  }
  pub async fn image_tile(&self, id: &str, level: u32, x: u32, y: u32) -> Result<Option<String>> {
    let _lease = self.lease().await?;
    let mut db = self.inner.pool.acquire().await?;
    document::resources::image_tile(&mut db, id, level, x, y).await
  }
  pub async fn set_derivatives(&self, id: &str, derivatives: Derivatives) -> Result<()> {
    let _lease = self.lease().await?;
    let mut tx = self.inner.pool.begin().await?;
    document::resources::link_derivatives(&mut tx, id, &derivatives).await?;
    tx.commit().await?;
    Ok(())
  }
}
impl ResourceSource for ResourceVault {
  fn open<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<ResourceReader>> {
    Box::pin(async move {
      let lease = self.lease().await?;
      let tx = self.inner.pool.begin().await?;
      document::resources::pooled_reader(tx, id, lease).await
    })
  }
  fn derivatives<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<Derivatives>> {
    Box::pin(async move { ResourceVault::derivatives(self, id).await })
  }
}
