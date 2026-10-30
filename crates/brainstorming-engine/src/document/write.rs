use super::{ResourceSource, Result, resource_write, structure, validation::validate_workbook};
use serde_json::Value;
use sqlx::{Connection, SqliteConnection};

pub(crate) async fn write(
  db: &mut SqliteConnection,
  mut workbook: Value,
  source: Option<&dyn ResourceSource>,
) -> Result<Value> {
  validate_workbook(&workbook)?;
  let preview_hash = super::previews::content_hash(&workbook)?;
  let mut transaction = db.begin_with("BEGIN IMMEDIATE").await?;
  resource_write::normalize(&mut transaction, &mut workbook, source).await?;
  validate_workbook(&workbook)?;
  structure::replace(&mut transaction, &workbook).await?;
  let revision = uuid::Uuid::new_v4().to_string();
  sqlx::query("INSERT INTO document_revisions VALUES (?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?2)")
    .bind(&revision)
    .bind(serde_json::to_string(&workbook)?)
    .execute(&mut *transaction)
    .await?;
  sqlx::query("INSERT INTO revision_resources SELECT ?1,object_id FROM resources UNION SELECT ?1,variant_object_id FROM resource_variants WHERE object_id IN (SELECT object_id FROM resources) UNION SELECT ?1,tile_object_id FROM image_tiles WHERE object_id IN (SELECT object_id FROM resources)")
        .bind(&revision)
        .execute(&mut *transaction)
        .await?;
  sqlx::query("DELETE FROM revision_resources WHERE revision_id IN (SELECT id FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 20)")
        .execute(&mut *transaction)
        .await?;
  sqlx::query("DELETE FROM document_revisions WHERE id IN (SELECT id FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 20)")
        .execute(&mut *transaction)
        .await?;
  super::previews::content_saved(
    &mut transaction,
    &super::previews::content_hash(&workbook)?,
    &preview_hash,
  )
  .await?;
  transaction.commit().await?;
  Ok(workbook)
}
