//! Read-only, transaction-consistent document and resource access for non-editor consumers.
use super::{Result, error::invalid, pool, resources, schema, structure};
use crate::transport::{ObjectInfo, ReadFuture, ResourceBackend};
use serde_json::Value;
use sqlx::{ConnectOptions, Connection, SqliteConnection};
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
};
use tokio::sync::Mutex;

pub struct DocumentSnapshot {
  path: PathBuf,
  workbook: Value,
  objects: HashMap<String, ObjectInfo>,
  connection: Mutex<Option<SqliteConnection>>,
}

impl DocumentSnapshot {
  pub async fn open(path: impl AsRef<Path>, password: Option<&str>) -> Result<Self> {
    let path = pool::canonical(path.as_ref())?;
    let mut db = schema::options(&path, password, false, true)?
      .pragma("query_only", "ON")
      .connect()
      .await?;
    let result = async {
      schema::authenticate(&mut db).await?;
      sqlx::query("BEGIN DEFERRED").execute(&mut db).await?;
      let application: i64 = sqlx::query_scalar("PRAGMA application_id")
        .fetch_one(&mut db)
        .await?;
      let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&mut db)
        .await?;
      if application != schema::APPLICATION_ID || version != schema::PROTOCOL_VERSION {
        return Err(invalid("不支持此原生文件版本；原生文件协议为 2"));
      }
      // Validate migrations, but never apply them or change the source file.
      schema::verify_snapshot(&mut db).await?;
      let workbook = structure::read(&mut db).await?;
      let mut objects = HashMap::new();
      for sheet in workbook["sheets"].as_array().into_iter().flatten() {
        for asset in sheet["document"]["assets"]
          .as_object()
          .into_iter()
          .flat_map(|assets| assets.values())
        {
          for (storage, mime) in [
            (&asset["storage"], asset["mimeType"].as_str()),
            (
              &asset["storage"]["preview"],
              asset["storage"]["preview"]["mimeType"].as_str(),
            ),
          ] {
            if let (Some(id), Some(mime)) = (storage["objectId"].as_str(), mime) {
              objects.insert(
                id.to_owned(),
                ObjectInfo {
                  byte_length: resources::size(&mut db, id).await?,
                  mime_type: mime.into(),
                },
              );
            }
          }
        }
      }
      Ok::<_, super::DocumentError>((workbook, objects))
    }
    .await;
    match result {
      Ok((workbook, objects)) => Ok(Self {
        path,
        workbook,
        objects,
        connection: Mutex::new(Some(db)),
      }),
      Err(error) => {
        db.close().await?;
        Err(error)
      }
    }
  }
  pub fn workbook(&self) -> &Value {
    &self.workbook
  }
  pub fn path(&self) -> &Path {
    &self.path
  }
  pub async fn close(&self) -> Result<()> {
    if let Some(db) = self.connection.lock().await.take() {
      db.close().await?;
    }
    Ok(())
  }
}

impl ResourceBackend for DocumentSnapshot {
  fn info<'a>(&'a self, id: &'a str) -> ReadFuture<'a, ObjectInfo> {
    Box::pin(async move {
      if self.connection.lock().await.is_none() {
        return Err("文档快照已关闭".into());
      }
      self
        .objects
        .get(id)
        .cloned()
        .ok_or_else(|| "资源不属于文档快照".into())
    })
  }
  fn read<'a>(&'a self, id: &'a str, offset: u64, length: u64) -> ReadFuture<'a, Vec<u8>> {
    Box::pin(async move {
      if !self.objects.contains_key(id) || length > resources::RESOURCE_CHUNK_BYTES as u64 {
        return Err("资源读取范围无效".into());
      }
      let mut connection = self.connection.lock().await;
      let db = connection.as_mut().ok_or("文档快照已关闭")?;
      resources::read_range(db, id, offset, Some(length))
        .await
        .map_err(|e| e.to_string())
    })
  }
  fn tile<'a>(
    &'a self,
    _id: &'a str,
    _level: u32,
    _x: u32,
    _y: u32,
  ) -> ReadFuture<'a, Option<String>> {
    Box::pin(async { Err("导出快照不提供瓦片服务".into()) })
  }
}
