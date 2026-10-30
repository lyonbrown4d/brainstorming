use super::{DocumentError, DocumentStore, Result, error::invalid};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{Connection, SqliteConnection};
use std::{collections::HashSet, io::Cursor, path::Path};

pub const PREVIEW_VERSION: u32 = 1;
pub const MAX_PREVIEW_BYTES: usize = 1024 * 1024;
pub const MAX_TOTAL_PREVIEW_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_PREVIEW_DIMENSION: u32 = 1600;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SheetPreview {
  pub sheet_id: String,
  pub png: Vec<u8>,
}

pub(crate) fn content_hash(workbook: &Value) -> Result<String> {
  Ok(hex::encode(Sha256::digest(serde_json::to_vec(workbook)?)))
}

/// Runs in the content transaction. A changed save never exposes an older image.
pub(crate) async fn content_saved(
  db: &mut SqliteConnection,
  hash: &str,
  input_hash: &str,
) -> Result<()> {
  sqlx::query("DELETE FROM document_previews WHERE source_hash<>?1")
    .bind(hash)
    .execute(&mut *db)
    .await?;
  sqlx::query("INSERT INTO document_preview_state VALUES(1,?1,?2,NULL) ON CONFLICT(id) DO UPDATE SET content_hash=excluded.content_hash,input_hash=excluded.input_hash,cover_sheet_id=CASE WHEN cover_sheet_id IN (SELECT id FROM sheets) THEN cover_sheet_id ELSE NULL END")
        .bind(hash).bind(input_hash).execute(&mut *db).await?;
  Ok(())
}

pub(crate) fn validate_png(bytes: &[u8]) -> Result<(u32, u32)> {
  if bytes.len() > MAX_PREVIEW_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
    return Err(invalid("文档预览 PNG 无效或超过 1 MiB"));
  }
  let mut decoder = png::Decoder::new(Cursor::new(bytes));
  decoder.set_limits(png::Limits {
    bytes: 16 * 1024 * 1024,
  });
  let mut reader = decoder
    .read_info()
    .map_err(|_| invalid("文档预览 PNG 无效"))?;
  let info = reader.info();
  let (width, height) = (info.width, info.height);
  if width == 0
    || height == 0
    || width > MAX_PREVIEW_DIMENSION
    || height > MAX_PREVIEW_DIMENSION
    || info.animation_control.is_some()
  {
    return Err(invalid("文档预览尺寸无效"));
  }
  let size = reader
    .output_buffer_size()
    .filter(|size| *size <= 16 * 1024 * 1024)
    .ok_or_else(|| invalid("文档预览解码超过限制"))?;
  reader
    .next_frame(&mut vec![0; size])
    .map_err(|_| invalid("文档预览 PNG 损坏"))?;
  reader.finish().map_err(|_| invalid("文档预览 PNG 损坏"))?;
  Ok((width, height))
}

impl DocumentStore {
  /// The renderer receives a revision only for the exact successful save snapshot.
  pub async fn preview_revision(
    &self,
    path: impl AsRef<Path>,
    workbook: &Value,
    password: Option<&str>,
  ) -> Result<Option<String>> {
    let hash = content_hash(workbook)?;
    let (path, mut entry) = self.registry.lock(path.as_ref()).await?;
    entry.run(path, password, false, move |db| Box::pin(async move {
            let current: Option<String> = sqlx::query_scalar("SELECT content_hash FROM document_preview_state WHERE id=1 AND (content_hash=?1 OR input_hash=?1)")
                .bind(hash).fetch_optional(db).await?;
            Ok(current)
        })).await
  }

  pub async fn write_previews(
    &self,
    path: impl AsRef<Path>,
    revision: String,
    cover: String,
    previews: Vec<SheetPreview>,
    password: Option<&str>,
  ) -> Result<bool> {
    if revision.len() != 64
      || !revision.bytes().all(|b| b.is_ascii_hexdigit())
      || previews.is_empty()
      || previews.len() > 128
    {
      return Err(invalid("文档预览版本或数量无效"));
    }
    let previews = tokio::task::spawn_blocking(move || {
      let mut total = 0usize;
      let mut ids = HashSet::new();
      let mut validated = Vec::with_capacity(previews.len());
      for preview in previews {
        total = total
          .checked_add(preview.png.len())
          .ok_or_else(|| invalid("文档预览超过限制"))?;
        if total > MAX_TOTAL_PREVIEW_BYTES || !ids.insert(preview.sheet_id.clone()) {
          return Err(invalid("文档预览超过限制或重复"));
        }
        let (width, height) = validate_png(&preview.png)?;
        validated.push((preview, width, height));
      }
      if !ids.contains(&cover) {
        return Err(invalid("封面不在文档预览中"));
      }
      Ok::<_, DocumentError>((cover, validated))
    })
    .await
    .map_err(|_| DocumentError::Worker)??;
    let (path, mut entry) = self.registry.lock(path.as_ref()).await?;
    entry
      .run(path, password, false, move |db| {
        Box::pin(async move {
          let mut tx = db.begin_with("BEGIN IMMEDIATE").await?;
          let current: Option<String> =
            sqlx::query_scalar("SELECT content_hash FROM document_preview_state WHERE id=1")
              .fetch_optional(&mut *tx)
              .await?;
          if current.as_deref() != Some(&revision) {
            return Ok(false);
          }
          let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM sheets")
            .fetch_all(&mut *tx)
            .await?;
          if previews
            .1
            .iter()
            .any(|(p, _, _)| !ids.contains(&p.sheet_id))
          {
            return Err(invalid("预览画布不属于当前文档"));
          }
          sqlx::query("DELETE FROM document_previews")
            .execute(&mut *tx)
            .await?;
          for (preview, width, height) in previews.1 {
            sqlx::query("INSERT INTO document_previews VALUES(?1,1,?2,?3,?4,?5)")
              .bind(preview.sheet_id)
              .bind(&revision)
              .bind(width)
              .bind(height)
              .bind(preview.png)
              .execute(&mut *tx)
              .await?;
          }
          sqlx::query("UPDATE document_preview_state SET cover_sheet_id=?1 WHERE id=1")
            .bind(previews.0)
            .execute(&mut *tx)
            .await?;
          tx.commit().await?;
          Ok(true)
        })
      })
      .await
  }
}
