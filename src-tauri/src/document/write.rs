use super::{ResourceSource, Result, resource_write, structure, validation::validate_workbook};
use rusqlite::{Connection, TransactionBehavior, params};
use serde_json::Value;

pub(crate) fn write(
    db: &mut Connection,
    mut workbook: Value,
    source: Option<&dyn ResourceSource>,
) -> Result<Value> {
    validate_workbook(&workbook)?;
    let transaction = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    resource_write::normalize(&transaction, &mut workbook, source)?;
    validate_workbook(&workbook)?;
    structure::replace(&transaction, &workbook)?;
    let revision = uuid::Uuid::new_v4().to_string();
    transaction.execute(
        "INSERT INTO document_revisions VALUES (?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?2)",
        params![revision, serde_json::to_string(&workbook)?],
    )?;
    transaction.execute("INSERT INTO revision_resources SELECT ?1,object_id FROM resources UNION SELECT ?1,variant_object_id FROM resource_variants WHERE object_id IN (SELECT object_id FROM resources) UNION SELECT ?1,tile_object_id FROM image_tiles WHERE object_id IN (SELECT object_id FROM resources)",[&revision])?;
    transaction.execute("DELETE FROM revision_resources WHERE revision_id IN (SELECT id FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 20)",[])?;
    transaction.execute("DELETE FROM document_revisions WHERE id IN (SELECT id FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 20)",[])?;
    transaction.commit()?;
    Ok(workbook)
}
