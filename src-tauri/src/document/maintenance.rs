use super::{Result, error::invalid, resources, validation::validate_workbook};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub id: String,
    pub created_at: String,
}

pub(crate) fn revisions(db: &Connection) -> Result<Vec<Revision>> {
    let mut query = db.prepare(
        "SELECT id,created_at FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT 20",
    )?;
    Ok(query
        .query_map([], |r| {
            Ok(Revision {
                id: r.get(0)?,
                created_at: r.get(1)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?)
}

pub(crate) fn read_revision(db: &Connection, id: &str) -> Result<Value> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(invalid("版本标识无效"));
    }
    let data: String = db
        .query_row(
            "SELECT metadata FROM document_revisions WHERE id=?1 AND length(metadata)<=134217728",
            [id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or_else(|| invalid("文档版本不存在或超过限制"))?;
    let workbook = serde_json::from_str(&data)?;
    validate_workbook(&workbook)?;
    Ok(workbook)
}

pub(crate) fn compact(db: &mut Connection, pinned: &[String]) -> Result<u64> {
    if pinned.len() > 100_000 {
        return Err(invalid("固定资源数量超过限制"));
    }
    for id in pinned {
        resources::assert_object_id(id)?;
    }
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    tx.execute_batch("CREATE TEMP TABLE native_compaction_keep (id TEXT PRIMARY KEY)")?;
    tx.execute("INSERT INTO native_compaction_keep SELECT object_id FROM resources UNION SELECT object_id FROM revision_resources UNION SELECT value FROM json_each(?1)",[serde_json::to_string(pinned)?])?;
    tx.execute_batch("INSERT OR IGNORE INTO native_compaction_keep SELECT variant_object_id FROM resource_variants WHERE object_id IN (SELECT id FROM native_compaction_keep); INSERT OR IGNORE INTO native_compaction_keep SELECT tile_object_id FROM image_tiles WHERE object_id IN (SELECT id FROM native_compaction_keep);")?;
    let removed:u64=tx.query_row("SELECT count(*) FROM resource_objects WHERE id NOT IN (SELECT id FROM native_compaction_keep)",[],|r|r.get(0))?;
    tx.execute_batch("DELETE FROM resource_chunks WHERE object_id NOT IN (SELECT id FROM native_compaction_keep); DELETE FROM resource_variants WHERE object_id NOT IN (SELECT id FROM native_compaction_keep) OR variant_object_id NOT IN (SELECT id FROM native_compaction_keep); DELETE FROM image_tiles WHERE object_id NOT IN (SELECT id FROM native_compaction_keep) OR tile_object_id NOT IN (SELECT id FROM native_compaction_keep); DELETE FROM resource_objects WHERE id NOT IN (SELECT id FROM native_compaction_keep); DROP TABLE native_compaction_keep;")?;
    tx.commit()?;
    db.execute_batch("VACUUM")?;
    Ok(removed)
}
