use super::{Result, error::invalid, resources, validation::validate_workbook};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Connection, SqliteConnection};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub id: String,
    pub created_at: String,
}

pub(crate) async fn revisions(db: &mut SqliteConnection) -> Result<Vec<Revision>> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT id,created_at FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT 20",
    )
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, created_at)| Revision { id, created_at })
        .collect())
}

pub(crate) async fn read_revision(db: &mut SqliteConnection, id: &str) -> Result<Value> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(invalid("版本标识无效"));
    }
    let data: String = sqlx::query_scalar(
        "SELECT metadata FROM document_revisions WHERE id=?1 AND length(metadata)<=134217728",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| invalid("文档版本不存在或超过限制"))?;
    let workbook = serde_json::from_str(&data)?;
    validate_workbook(&workbook)?;
    Ok(workbook)
}

pub(crate) async fn compact(db: &mut SqliteConnection, pinned: &[String]) -> Result<u64> {
    if pinned.len() > 100_000 {
        return Err(invalid("固定资源数量超过限制"));
    }
    for id in pinned {
        resources::assert_object_id(id)?;
    }
    let mut tx = db.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("CREATE TEMP TABLE native_compaction_keep (id TEXT PRIMARY KEY)")
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO native_compaction_keep SELECT object_id FROM resources UNION SELECT object_id FROM revision_resources UNION SELECT value FROM json_each(?1)")
        .bind(serde_json::to_string(pinned)?)
        .execute(&mut *tx)
        .await?;
    sqlx::raw_sql("INSERT OR IGNORE INTO native_compaction_keep SELECT variant_object_id FROM resource_variants WHERE object_id IN (SELECT id FROM native_compaction_keep); INSERT OR IGNORE INTO native_compaction_keep SELECT tile_object_id FROM image_tiles WHERE object_id IN (SELECT id FROM native_compaction_keep);")
        .execute(&mut *tx)
        .await?;
    let removed: i64 = sqlx::query_scalar("SELECT count(*) FROM resource_objects WHERE id NOT IN (SELECT id FROM native_compaction_keep)")
        .fetch_one(&mut *tx)
        .await?;
    let removed = u64::try_from(removed).map_err(|_| invalid("资源数量无效"))?;
    sqlx::raw_sql("DELETE FROM resource_chunks WHERE object_id NOT IN (SELECT id FROM native_compaction_keep); DELETE FROM resource_variants WHERE object_id NOT IN (SELECT id FROM native_compaction_keep) OR variant_object_id NOT IN (SELECT id FROM native_compaction_keep); DELETE FROM image_tiles WHERE object_id NOT IN (SELECT id FROM native_compaction_keep) OR tile_object_id NOT IN (SELECT id FROM native_compaction_keep); DELETE FROM resource_objects WHERE id NOT IN (SELECT id FROM native_compaction_keep); DROP TABLE native_compaction_keep;")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    sqlx::query("VACUUM").execute(db).await?;
    Ok(removed)
}
