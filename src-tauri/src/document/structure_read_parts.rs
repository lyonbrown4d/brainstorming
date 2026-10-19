use super::{Result, content_validation::references, error::invalid, validation::*};
use serde_json::{Map, Value, json};
use sqlx::SqliteConnection;
use std::collections::HashMap;

pub(super) async fn read_topics(db: &mut SqliteConnection, sid: &str, root: &str) -> Result<Value> {
  let rows: Vec<(String, Option<String>, i64, String)> = sqlx::query_as(
    "SELECT id,parent_id,position,data FROM topics WHERE sheet_id=?1 ORDER BY position",
  )
  .bind(sid)
  .fetch_all(&mut *db)
  .await?;
  let mut topics = Map::new();
  let mut children: HashMap<String, Vec<Value>> = HashMap::new();
  for (tid, parent, position, data) in rows {
    let mut topic: Value = serde_json::from_str(&data)?;
    if topic["id"] != tid || topic.get("children").is_some() {
      return Err(invalid("主题标识或子节点存储无效"));
    }
    if let Some(parent) = parent {
      let siblings = children.entry(parent).or_default();
      if position != siblings.len() as i64 {
        return Err(invalid("主题顺序无效"));
      }
      siblings.push(json!(tid));
    } else if tid != root || position != 0 {
      return Err(invalid("主题根节点无效"));
    }
    topic["children"] = json!([]);
    topics.insert(tid, topic);
  }
  for (parent, ids) in children {
    topics
      .get_mut(&parent)
      .ok_or_else(|| invalid("主题父节点不存在"))?["children"] = Value::Array(ids);
  }
  Ok(Value::Object(topics))
}

pub(super) async fn read_annotations(
  db: &mut SqliteConnection,
  sid: &str,
  kind: &str,
) -> Result<Vec<Value>> {
  let rows: Vec<(String, i64, String)> = sqlx::query_as(
    "SELECT id,position,data FROM annotations WHERE sheet_id=?1 AND kind=?2 ORDER BY position",
  )
  .bind(sid)
  .bind(kind)
  .fetch_all(&mut *db)
  .await?;
  let mut items = Vec::new();
  for (annotation_id, position, data) in rows {
    if position != items.len() as i64 {
      return Err(invalid("批注顺序无效"));
    }
    let mut item: Value = serde_json::from_str(&data)?;
    if kind != "presentation" && item["id"] != annotation_id {
      return Err(invalid("批注标识无效"));
    }
    if kind == "groups" {
      let rows: Vec<(String, i64)> = sqlx::query_as(
                "SELECT topic_id,position FROM group_members WHERE sheet_id=?1 AND group_id=?2 ORDER BY position",
            )
            .bind(sid)
            .bind(annotation_id)
            .fetch_all(&mut *db)
            .await?;
      let mut ids = Vec::new();
      for (id, position) in rows {
        if position != ids.len() as i64 {
          return Err(invalid("分组成员顺序无效"));
        }
        ids.push(json!(id));
      }
      item["topicIds"] = Value::Array(ids);
    }
    items.push(item);
  }
  Ok(items)
}

pub(super) async fn read_assets(
  db: &mut SqliteConnection,
  sid: &str,
) -> Result<Map<String, Value>> {
  let rows: Vec<(String, String, String, String, String, Option<i64>)> = sqlx::query_as(
        "SELECT r.id,r.object_id,r.name,r.mime_type,r.metadata,o.byte_length FROM resources r LEFT JOIN resource_objects o ON o.id=r.object_id WHERE sheet_id=?1",
    )
    .bind(sid)
    .fetch_all(&mut *db)
    .await?;
  let mut assets = Map::new();
  for (id, oid, name, mime, metadata, size) in rows {
    let size = size
      .map(u64::try_from)
      .transpose()
      .map_err(|_| invalid("资源对象长度无效"))?;
    let storage: Value = serde_json::from_str(&metadata)?;
    if storage["objectId"] != oid || storage["byteLength"].as_u64() != size {
      return Err(invalid("资源对象缺失或长度无效"));
    }
    assets.insert(
      id.clone(),
      json!({"id":id,"name":name,"mimeType":mime,"storage":storage}),
    );
  }
  Ok(assets)
}

pub(super) async fn verify_references(db: &mut SqliteConnection, workbook: &Value) -> Result<()> {
  let mut expected = std::collections::HashSet::new();
  for sheet in list(&workbook["sheets"], 128)? {
    for (tid, topic) in object(&sheet["document"]["topics"])? {
      for (aid, role, position) in references(topic)? {
        expected.insert((
          text(&sheet["id"])?.to_owned(),
          tid.clone(),
          aid,
          role.to_owned(),
          position as i64,
        ));
      }
    }
  }
  let actual: Vec<(String, String, String, String, i64)> =
    sqlx::query_as("SELECT sheet_id,topic_id,resource_id,role,position FROM topic_resources")
      .fetch_all(&mut *db)
      .await?;
  let actual: std::collections::HashSet<_> = actual.into_iter().collect();
  if expected != actual {
    return Err(invalid("主题资源引用表与内容不一致"));
  }
  Ok(())
}
