use super::{
    Result,
    error::invalid,
    resources::{MAX_OBJECT_BYTES, RESOURCE_CHUNK_BYTES, ResourceObject, assert_object_id},
};
use sha2::{Digest, Sha256};
use sqlx::SqliteConnection;
use tokio::io::{AsyncRead, AsyncReadExt};

pub(crate) async fn insert(
    db: &mut SqliteConnection,
    reader: &mut (dyn AsyncRead + Unpin + Send),
    expected: Option<(&str, u64)>,
) -> Result<ResourceObject> {
    if let Some((id, length)) = expected {
        assert_object_id(id)?;
        if length > MAX_OBJECT_BYTES {
            return Err(invalid("资源对象超过 256 GiB"));
        }
        let existing: Option<i64> =
            sqlx::query_scalar("SELECT byte_length FROM resource_objects WHERE id=?1")
                .bind(id)
                .fetch_optional(&mut *db)
                .await?;
        if let Some(existing) = existing {
            if existing < 0 || existing as u64 != length {
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
            match reader.read(&mut buffer[filled..]).await {
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
        sqlx::query("INSERT INTO resource_chunks VALUES (?1,?2,?3,?4)")
            .bind(&temporary)
            .bind(position)
            .bind(chunk)
            .bind(hex::encode(Sha256::digest(chunk)))
            .execute(&mut *db)
            .await?;
        position += 1;
    }
    let id = hex::encode(hash.finalize());
    if expected.is_some_and(|(expected_id, n)| expected_id != id || n != length) {
        return Err(invalid("资源长度或 SHA-256 校验失败"));
    }
    let existing: Option<i64> =
        sqlx::query_scalar("SELECT byte_length FROM resource_objects WHERE id=?1")
            .bind(&id)
            .fetch_optional(&mut *db)
            .await?;
    if let Some(existing) = existing {
        if existing < 0 || existing as u64 != length {
            return Err(invalid("资源对象长度不一致"));
        }
        sqlx::query("DELETE FROM resource_chunks WHERE object_id=?1")
            .bind(temporary)
            .execute(db)
            .await?;
    } else {
        sqlx::query("INSERT INTO resource_objects VALUES (?1,?2)")
            .bind(&id)
            .bind(length as i64)
            .execute(&mut *db)
            .await?;
        sqlx::query("UPDATE resource_chunks SET object_id=?1 WHERE object_id=?2")
            .bind(&id)
            .bind(temporary)
            .execute(db)
            .await?;
    }
    Ok(ResourceObject {
        object_id: id,
        byte_length: length,
    })
}
