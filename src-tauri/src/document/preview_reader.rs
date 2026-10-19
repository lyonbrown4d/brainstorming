//! Read-only shell boundary: no credentials, migrations, renderer, or network.
use super::{Result, error::invalid, previews, schema};
use sqlx::{ConnectOptions, Connection, Row, sqlite::SqliteConnectOptions};
use std::{path::Path, time::Duration};
use tokio::io::AsyncReadExt;

pub struct StoredSheetPreview {
  pub sheet_id: String,
  pub name: String,
  pub width: u32,
  pub height: u32,
  pub png: Vec<u8>,
}

pub async fn read(path: impl AsRef<Path>, cover_only: bool) -> Result<Vec<StoredSheetPreview>> {
  let path = path.as_ref();
  let mut file = tokio::fs::File::open(path).await?;
  let mut header = [0; 16];
  file.read_exact(&mut header).await?;
  if &header != b"SQLite format 3\0" {
    return Err(invalid("加密文件不提供系统预览"));
  }
  let mut db = SqliteConnectOptions::new()
    .filename(path)
    .read_only(true)
    .busy_timeout(Duration::from_millis(250))
    .pragma("query_only", "ON")
    .pragma("trusted_schema", "OFF")
    .disable_statement_logging()
    .connect()
    .await?;
  {
    let mut handle = db.lock_handle().await?;
    // SAFETY: SQLx holds its worker lock and the live handle never escapes.
    unsafe {
      libsqlite3_sys::sqlite3_limit(
        handle.as_raw_handle().as_ptr(),
        libsqlite3_sys::SQLITE_LIMIT_LENGTH,
        1_052_672,
      );
      libsqlite3_sys::sqlite3_limit(
        handle.as_raw_handle().as_ptr(),
        libsqlite3_sys::SQLITE_LIMIT_SQL_LENGTH,
        16_384,
      );
    }
  }
  let result = async {
        let application: i64 = sqlx::query_scalar("PRAGMA application_id").fetch_one(&mut db).await?;
        let version: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&mut db).await?;
        if application != schema::APPLICATION_ID || version != schema::PROTOCOL_VERSION { return Err(invalid("文档预览协议无效")); }
        let tables: i64 = sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('document_previews','document_preview_state','sheets') AND sql NOT LIKE '%VIRTUAL%'").fetch_one(&mut db).await?;
        if tables != 3 { return Ok(Vec::new()); }
        let total_bytes: i64 = sqlx::query_scalar("SELECT COALESCE(sum(length(p.png)),0) FROM document_previews p JOIN document_preview_state d ON d.id=1 WHERE p.version=1 AND p.source_hash=d.content_hash AND (?1=0 OR p.sheet_id=d.cover_sheet_id)")
            .bind(cover_only).fetch_one(&mut db).await?;
        if total_bytes > super::MAX_TOTAL_PREVIEW_BYTES as i64 { return Err(invalid("文档预览超过限制")); }
        let rows = sqlx::query("SELECT p.sheet_id,s.name,p.width,p.height,p.png FROM document_previews p JOIN sheets s ON s.id=p.sheet_id JOIN document_preview_state d ON d.id=1 WHERE p.version=1 AND p.source_hash=d.content_hash AND length(p.png) BETWEEN 1 AND 1048576 AND p.width BETWEEN 1 AND 1600 AND p.height BETWEEN 1 AND 1600 AND (?1=0 OR p.sheet_id=d.cover_sheet_id) ORDER BY (p.sheet_id=d.cover_sheet_id) DESC,s.position LIMIT 128")
            .bind(cover_only).fetch_all(&mut db).await?;
        let mut total = 0usize;
        let mut previews = Vec::with_capacity(rows.len());
        for row in rows {
            let png: Vec<u8> = row.try_get("png")?;
            total += png.len();
            if total > super::MAX_TOTAL_PREVIEW_BYTES { return Err(invalid("文档预览超过限制")); }
            previews.push(StoredSheetPreview { sheet_id: row.try_get("sheet_id")?, name: row.try_get("name")?, width: row.try_get("width")?, height: row.try_get("height")?, png });
        }
        Ok(previews)
    }.await;
  db.close().await?;
  let images = result?;
  tokio::task::spawn_blocking(move || {
    for preview in &images {
      if previews::validate_png(&preview.png)? != (preview.width, preview.height) {
        return Err(invalid("文档预览尺寸不一致"));
      }
    }
    Ok(images)
  })
  .await
  .map_err(|_| super::DocumentError::Worker)?
}
