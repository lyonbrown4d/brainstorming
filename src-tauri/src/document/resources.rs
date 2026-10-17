use super::{Result, error::invalid};
use futures_util::{TryStreamExt, future::BoxFuture};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqliteConnection};
use tokio::io::AsyncRead;

pub(crate) use super::resource_insert::insert;
pub(crate) use super::resource_reader::pooled_reader;
pub type ResourceReader = Box<dyn AsyncRead + Unpin + Send>;

pub const RESOURCE_CHUNK_BYTES: usize = 256 * 1024;
pub const MAX_RANGE_BYTES: u64 = 16 * 1024 * 1024;
pub const MAX_OBJECT_BYTES: u64 = 256 * 1024u64.pow(3);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceObject {
    pub object_id: String,
    pub byte_length: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Derivatives {
    pub preview: Option<Preview>,
    pub tiles: Vec<Tile>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub object_id: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tile {
    pub object_id: String,
    pub level: u32,
    pub x: u32,
    pub y: u32,
}

pub trait ResourceSource: Send + Sync {
    fn open<'a>(&'a self, object_id: &'a str) -> BoxFuture<'a, Result<ResourceReader>>;
    fn derivatives<'a>(&'a self, _object_id: &'a str) -> BoxFuture<'a, Result<Derivatives>> {
        Box::pin(async { Ok(Derivatives::default()) })
    }
}

pub fn assert_object_id(id: &str) -> Result<()> {
    if id.len() != 64
        || !id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(invalid("资源对象标识必须为 SHA-256"));
    }
    Ok(())
}

pub(crate) async fn size(db: &mut SqliteConnection, id: &str) -> Result<u64> {
    assert_object_id(id)?;
    let length: Option<i64> =
        sqlx::query_scalar("SELECT byte_length FROM resource_objects WHERE id=?1")
            .bind(id)
            .fetch_optional(db)
            .await?;
    let length = length.ok_or_else(|| invalid("资源对象不存在"))?;
    u64::try_from(length)
        .ok()
        .filter(|n| *n <= MAX_OBJECT_BYTES)
        .ok_or_else(|| invalid("资源对象长度无效"))
}

pub(crate) async fn read_range(
    db: &mut SqliteConnection,
    id: &str,
    offset: u64,
    length: Option<u64>,
) -> Result<Vec<u8>> {
    let total = size(db, id).await?;
    let requested = length.unwrap_or_else(|| total.saturating_sub(offset));
    if requested > MAX_RANGE_BYTES {
        return Err(invalid("单次资源读取超过 16 MiB，请使用分段读取"));
    }
    let end = offset
        .checked_add(requested)
        .ok_or_else(|| invalid("资源范围溢出"))?
        .min(total);
    if end <= offset {
        return Ok(Vec::new());
    }
    let start_chunk = offset / RESOURCE_CHUNK_BYTES as u64;
    let end_chunk = (end - 1) / RESOURCE_CHUNK_BYTES as u64;
    let mut rows = sqlx::query("SELECT position,substr(data,1,262145),length(data),substr(sha256,1,65),length(sha256),typeof(data) FROM resource_chunks WHERE object_id=?1 AND position BETWEEN ?2 AND ?3 ORDER BY position")
        .bind(id).bind(start_chunk as i64).bind(end_chunk as i64).fetch(db);
    let mut bytes = Vec::with_capacity((end - offset) as usize);
    let mut index = start_chunk;
    while let Some(row) = rows.try_next().await? {
        let position: i64 = row.try_get(0)?;
        let data: Vec<u8> = row.try_get(1)?;
        let stored: i64 = row.try_get(2)?;
        let checksum: String = row.try_get(3)?;
        let checksum_length: i64 = row.try_get(4)?;
        let kind: String = row.try_get(5)?;
        let expected = (RESOURCE_CHUNK_BYTES as u64)
            .min(total.saturating_sub(index * RESOURCE_CHUNK_BYTES as u64));
        if position != index as i64
            || kind != "blob"
            || stored != expected as i64
            || data.len() as u64 != expected
            || checksum_length != 64
            || hex::encode(Sha256::digest(&data)) != checksum
        {
            return Err(invalid("资源分块损坏或缺失"));
        }
        let chunk_start = index * RESOURCE_CHUNK_BYTES as u64;
        bytes.extend_from_slice(
            &data[offset.saturating_sub(chunk_start) as usize
                ..(end - chunk_start).min(data.len() as u64) as usize],
        );
        index += 1;
    }
    if index != end_chunk + 1 {
        return Err(invalid("资源分块缺失"));
    }
    Ok(bytes)
}

pub(crate) async fn derivatives(db: &mut SqliteConnection, id: &str) -> Result<Derivatives> {
    assert_object_id(id)?;
    let preview = sqlx::query("SELECT variant_object_id,mime_type,width,height FROM resource_variants WHERE object_id=?1 AND kind='preview'")
        .bind(id).fetch_optional(&mut *db).await?
        .map(|r| -> Result<Preview> { Ok(Preview {
            object_id: r.try_get(0)?, mime_type: r.try_get(1)?,
            width: r.try_get(2)?, height: r.try_get(3)?,
        }) }).transpose()?;
    let rows = sqlx::query("SELECT tile_object_id,level,x,y FROM image_tiles WHERE object_id=?1 ORDER BY level,y,x LIMIT 100001")
        .bind(id).fetch_all(db).await?;
    if rows.len() > 100_000 {
        return Err(invalid("图片瓦片数量超过限制"));
    }
    let tiles = rows
        .into_iter()
        .map(|r| -> Result<Tile> {
            Ok(Tile {
                object_id: r.try_get(0)?,
                level: r.try_get(1)?,
                x: r.try_get(2)?,
                y: r.try_get(3)?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Derivatives { preview, tiles })
}

pub(crate) async fn link_derivatives(
    db: &mut SqliteConnection,
    id: &str,
    items: &Derivatives,
) -> Result<()> {
    size(db, id).await?;
    if let Some(preview) = &items.preview {
        size(db, &preview.object_id).await?;
        if preview.width == 0
            || preview.height == 0
            || preview.width > 65536
            || preview.height > 65536
        {
            return Err(invalid("预览尺寸无效"));
        }
        sqlx::query("INSERT OR REPLACE INTO resource_variants VALUES (?1,'preview',?2,?3,?4,?5)")
            .bind(id)
            .bind(&preview.object_id)
            .bind(&preview.mime_type)
            .bind(preview.width)
            .bind(preview.height)
            .execute(&mut *db)
            .await?;
    }
    for tile in &items.tiles {
        size(db, &tile.object_id).await?;
        sqlx::query("INSERT OR REPLACE INTO image_tiles VALUES (?1,?2,?3,?4,?5)")
            .bind(id)
            .bind(tile.level)
            .bind(tile.x)
            .bind(tile.y)
            .bind(&tile.object_id)
            .execute(&mut *db)
            .await?;
    }
    Ok(())
}

pub(crate) async fn image_tile(
    db: &mut SqliteConnection,
    id: &str,
    level: u32,
    x: u32,
    y: u32,
) -> Result<Option<String>> {
    assert_object_id(id)?;
    Ok(sqlx::query_scalar(
        "SELECT tile_object_id FROM image_tiles WHERE object_id=?1 AND level=?2 AND x=?3 AND y=?4",
    )
    .bind(id)
    .bind(level)
    .bind(x)
    .bind(y)
    .fetch_optional(db)
    .await?)
}
