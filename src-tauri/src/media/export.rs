use super::{MediaState, Result};
use crate::{runtime::input, transport::ResourceBackend};
use base64::Engine;
use serde_json::Value;
use tokio::io::AsyncWriteExt;

pub async fn asset(media: &MediaState, mut asset: Value) -> Result<bool> {
    let name = input::text(&asset, "name", 255)?.to_owned();
    let inline = if let Some(data) = asset.get_mut("data").map(Value::take) {
        Some(
            tokio::task::spawn_blocking(move || {
                let text = data
                    .as_str()
                    .filter(|s| s.len() <= 8 * 1024 * 1024 * 4 / 3 + 4)
                    .ok_or("内联资源超过限制")?;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(text)
                    .map_err(|_| "资源编码无效")?;
                if bytes.len() > 8 * 1024 * 1024 {
                    return Err("内联资源超过限制".into());
                }
                Ok::<_, String>(bytes)
            })
            .await
            .map_err(|_| "资源解码任务失败")??,
        )
    } else {
        None
    };
    let id = asset["storage"]["objectId"].as_str();
    let info = if inline.is_none() {
        Some(
            media
                .importer
                .catalog
                .info(id.ok_or("资源对象无效")?)
                .await?,
        )
    } else {
        None
    };
    let extension = std::path::Path::new(&name)
        .extension()
        .and_then(|s| s.to_str())
        .filter(|s| s.len() <= 16 && s.bytes().all(|b| b.is_ascii_alphanumeric()))
        .unwrap_or("bin");
    let directory =
        super::temporary::Directory::create(media.state.directory.clone(), "asset-export-").await?;
    let path = directory.path().join("resource");
    let mut output = tokio::fs::File::create(&path)
        .await
        .map_err(|_| "无法创建资源文件")?;
    if let Some(bytes) = inline {
        output
            .write_all(&bytes)
            .await
            .map_err(|_| "无法写入资源文件")?;
    } else if let Some(info) = info {
        let id = id.ok_or("资源对象无效")?;
        let mut offset = 0;
        while offset < info.byte_length {
            let length =
                (info.byte_length - offset).min(crate::document::RESOURCE_CHUNK_BYTES as u64);
            let bytes = media.importer.catalog.read(id, offset, length).await?;
            if bytes.len() as u64 != length {
                return Err("资源读取不完整".into());
            }
            output
                .write_all(&bytes)
                .await
                .map_err(|_| "无法写入资源文件")?;
            offset += length;
        }
    }
    output.sync_all().await.map_err(|_| "无法同步资源文件")?;
    drop(output);
    let exported =
        crate::runtime::native_files::export_completed(&media.app, &path, &name, extension).await;
    directory.close().await?;
    Ok(exported?.is_some())
}
