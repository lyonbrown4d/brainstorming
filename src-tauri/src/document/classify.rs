use super::{Result, error};
use std::path::Path;

pub async fn is_encrypted(path: impl AsRef<Path>) -> Result<bool> {
    use tokio::io::AsyncReadExt;
    let file = tokio::fs::File::open(path).await?;
    let mut header = Vec::with_capacity(128);
    file.take(128).read_to_end(&mut header).await?;
    if header.starts_with(b"PK\x03\x04") || header.starts_with(b"PK\x05\x06") {
        return Err(error::invalid("不支持旧 ZIP 原生文档；请使用原版本导出"));
    }
    if std::str::from_utf8(&header)
        .is_ok_and(|text| text.trim_start().starts_with('{') && text.contains("\"format\""))
    {
        return Err(error::invalid("不支持旧 JSON 原生文档；请使用原版本导出"));
    }
    if header.len() < 16 {
        return Err(error::invalid("Brainstorming 文件不完整"));
    }
    Ok(&header[..16] != b"SQLite format 3\0")
}
