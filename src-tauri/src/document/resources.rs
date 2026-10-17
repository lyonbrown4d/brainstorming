use super::{Result, error::invalid};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;

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
    fn open(&self, object_id: &str) -> Result<Box<dyn Read + Send>>;
    fn derivatives(&self, _object_id: &str) -> Result<Derivatives> {
        Ok(Derivatives::default())
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

pub(crate) fn size(db: &Connection, id: &str) -> Result<u64> {
    assert_object_id(id)?;
    db.query_row(
        "SELECT byte_length FROM resource_objects WHERE id=?1",
        [id],
        |r| r.get(0),
    )
    .optional()?
    .ok_or_else(|| invalid("资源对象不存在"))
}

pub(crate) fn insert(
    db: &Connection,
    reader: &mut dyn Read,
    expected: Option<(&str, u64)>,
) -> Result<ResourceObject> {
    if let Some((id, length)) = expected {
        assert_object_id(id)?;
        if length > MAX_OBJECT_BYTES {
            return Err(invalid("资源对象超过 256 GiB"));
        }
        if let Some(existing) = db
            .query_row(
                "SELECT byte_length FROM resource_objects WHERE id=?1",
                [id],
                |r| r.get::<_, u64>(0),
            )
            .optional()?
        {
            if existing != length {
                return Err(invalid("资源对象长度不一致"));
            }
            return Ok(ResourceObject {
                object_id: id.to_owned(),
                byte_length: length,
            });
        }
    }
    let temporary = uuid::Uuid::new_v4().to_string();
    let mut hash = Sha256::new();
    let mut length = 0u64;
    let mut position = 0i64;
    let mut buffer = vec![0; RESOURCE_CHUNK_BYTES];
    loop {
        let mut filled = 0;
        while filled < buffer.len() {
            match reader.read(&mut buffer[filled..]) {
                Ok(0) => break,
                Ok(n) => filled += n,
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error.into()),
            }
        }
        if filled == 0 {
            break;
        }
        let chunk = &buffer[..filled];
        length = length
            .checked_add(filled as u64)
            .ok_or_else(|| invalid("资源长度溢出"))?;
        if length > MAX_OBJECT_BYTES || expected.is_some_and(|(_, n)| length > n) {
            return Err(invalid("资源对象超出声明长度"));
        }
        hash.update(chunk);
        db.execute(
            "INSERT INTO resource_chunks VALUES (?1,?2,?3,?4)",
            params![
                temporary,
                position,
                chunk,
                hex::encode(Sha256::digest(chunk))
            ],
        )?;
        position += 1;
    }
    let id = hex::encode(hash.finalize());
    if expected.is_some_and(|(expected_id, n)| expected_id != id || n != length) {
        return Err(invalid("资源长度或 SHA-256 校验失败"));
    }
    let existing = db
        .query_row(
            "SELECT byte_length FROM resource_objects WHERE id=?1",
            [&id],
            |r| r.get::<_, u64>(0),
        )
        .optional()?;
    if let Some(existing) = existing {
        if existing != length {
            return Err(invalid("资源对象长度不一致"));
        }
        db.execute(
            "DELETE FROM resource_chunks WHERE object_id=?1",
            [temporary],
        )?;
    } else {
        db.execute(
            "INSERT INTO resource_objects VALUES (?1,?2)",
            params![id, length],
        )?;
        db.execute(
            "UPDATE resource_chunks SET object_id=?1 WHERE object_id=?2",
            params![id, temporary],
        )?;
    }
    Ok(ResourceObject {
        object_id: id,
        byte_length: length,
    })
}

pub(crate) fn read_range(
    db: &Connection,
    id: &str,
    offset: u64,
    length: Option<u64>,
) -> Result<Vec<u8>> {
    let total = size(db, id)?;
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
    let mut query=db.prepare("SELECT position,substr(data,1,262145),length(data),substr(sha256,1,65),length(sha256),typeof(data) FROM resource_chunks WHERE object_id=?1 AND position BETWEEN ?2 AND ?3 ORDER BY position")?;
    let mut rows = query.query(params![id, start_chunk, end_chunk])?;
    let mut bytes = Vec::with_capacity((end - offset) as usize);
    let mut index = start_chunk;
    while let Some(row) = rows.next()? {
        let position: u64 = row.get(0)?;
        let data: Vec<u8> = row.get(1)?;
        let stored: u64 = row.get(2)?;
        let checksum: String = row.get(3)?;
        let checksum_length: u64 = row.get(4)?;
        let kind: String = row.get(5)?;
        let expected = (RESOURCE_CHUNK_BYTES as u64)
            .min(total.saturating_sub(position * RESOURCE_CHUNK_BYTES as u64));
        if position != index
            || kind != "blob"
            || stored != expected
            || data.len() as u64 != expected
            || checksum_length != 64
            || hex::encode(Sha256::digest(&data)) != checksum
        {
            return Err(invalid("资源分块损坏或缺失"));
        }
        let chunk_start = position * RESOURCE_CHUNK_BYTES as u64;
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

pub(crate) fn derivatives(db: &Connection, id: &str) -> Result<Derivatives> {
    let preview=db.query_row("SELECT variant_object_id,mime_type,width,height FROM resource_variants WHERE object_id=?1 AND kind='preview'",[id],|r|Ok(Preview{object_id:r.get(0)?,mime_type:r.get(1)?,width:r.get(2)?,height:r.get(3)?})).optional()?;
    let mut query = db.prepare(
        "SELECT tile_object_id,level,x,y FROM image_tiles WHERE object_id=?1 ORDER BY level,y,x LIMIT 100001",
    )?;
    let tiles = query
        .query_map([id], |r| {
            Ok(Tile {
                object_id: r.get(0)?,
                level: r.get(1)?,
                x: r.get(2)?,
                y: r.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if tiles.len() > 100_000 {
        return Err(invalid("图片瓦片数量超过限制"));
    }
    Ok(Derivatives { preview, tiles })
}

pub(crate) fn link_derivatives(db: &Connection, id: &str, items: &Derivatives) -> Result<()> {
    size(db, id)?;
    if let Some(preview) = &items.preview {
        size(db, &preview.object_id)?;
        if preview.width == 0
            || preview.height == 0
            || preview.width > 65536
            || preview.height > 65536
        {
            return Err(invalid("预览尺寸无效"));
        }
        db.execute(
            "INSERT OR REPLACE INTO resource_variants VALUES (?1,'preview',?2,?3,?4,?5)",
            params![
                id,
                preview.object_id,
                preview.mime_type,
                preview.width,
                preview.height
            ],
        )?;
    }
    for tile in &items.tiles {
        size(db, &tile.object_id)?;
        db.execute(
            "INSERT OR REPLACE INTO image_tiles VALUES (?1,?2,?3,?4,?5)",
            params![id, tile.level, tile.x, tile.y, tile.object_id],
        )?;
    }
    Ok(())
}

pub(crate) fn image_tile(
    db: &Connection,
    id: &str,
    level: u32,
    x: u32,
    y: u32,
) -> Result<Option<String>> {
    assert_object_id(id)?;
    Ok(db.query_row("SELECT tile_object_id FROM image_tiles WHERE object_id=?1 AND level=?2 AND x=?3 AND y=?4",params![id,level,x,y],|row|row.get(0)).optional()?)
}
