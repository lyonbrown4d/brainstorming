use super::{MediaState, Result};
use crate::runtime::{documents, input};
use serde_json::{Value, json};
use std::{path::PathBuf, time::Instant};

pub(super) async fn dispatch(
    media: &MediaState,
    method: &str,
    args: Value,
) -> Option<Result<Value>> {
    if !matches!(
        method,
        "selectAsset"
            | "exportAsset"
            | "importDroppedFiles"
            | "importRawFiles"
            | "queueLinkPreviews"
            | "generateLinkPreview"
            | "getLinkPreview"
    ) {
        return None;
    }
    Some(dispatch_known(media, method, args).await)
}
async fn dispatch_known(media: &MediaState, method: &str, mut args: Value) -> Result<Value> {
    match method {
        "selectAsset" => {
            let kind = input::text(&args, "kind", 16)?;
            let extensions: &[&str] = match kind {
                "image" => &["png", "jpg", "jpeg", "gif", "webp", "avif", "tif", "tiff"],
                "audio" => &["mp3", "wav", "ogg", "webm", "m4a", "aac", "flac"],
                "attachment" => &[],
                _ => return Err("资源类型无效".into()),
            };
            match crate::runtime::dialogs::pick(&media.app, kind, extensions).await? {
                Some(path) => media.importer.file(&path, kind).await,
                None => Ok(Value::Null),
            }
        }
        "exportAsset" => super::export::asset(
            media,
            args.get_mut("asset").map(Value::take).ok_or("缺少 asset")?,
        )
        .await
        .map(Value::Bool),
        "importDroppedFiles" => dropped(media, input::required(&args, "paths")?).await,
        "importRawFiles" => {
            raw(
                media,
                args.get_mut("files").map(Value::take).ok_or("缺少 files")?,
            )
            .await
        }
        "queueLinkPreviews" => {
            let urls = args["urls"]
                .as_array()
                .filter(|v| v.len() <= 1000)
                .ok_or("网页预览队列最多支持 1000 个地址")?;
            let urls = urls
                .iter()
                .map(|v| {
                    v.as_str()
                        .ok_or_else(|| "网页地址无效".to_string())
                        .and_then(super::network::normalize)
                })
                .collect::<Result<Vec<_>>>()?;
            media.previews.set_urls(urls).await?;
            Ok(Value::Null)
        }
        "generateLinkPreview" => {
            media
                .previews
                .generate(input::text(&args, "url", 2048)?)
                .await
        }
        "getLinkPreview" => media.previews.get(input::text(&args, "url", 2048)?).await,
        _ => unreachable!(),
    }
}
async fn dropped(media: &MediaState, input: &Value) -> Result<Value> {
    let input = input
        .as_array()
        .filter(|v| !v.is_empty() && v.len() <= 32)
        .ok_or("最多支持 32 个拖入文件")?;
    let mut paths = Vec::new();
    for item in input {
        let text = item
            .as_str()
            .filter(|s| s.len() <= 32768 && !s.contains('\0'))
            .ok_or("拖入文件路径无效")?;
        let path = PathBuf::from(text);
        if !path.is_absolute() {
            return Err("拖入文件路径无效".into());
        }
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    {
        let mut grants = media.grants.lock().map_err(|_| "拖入文件授权状态无效")?;
        grants.retain(|_, expires| *expires > Instant::now());
        if paths.iter().any(|p| !grants.contains_key(p)) {
            return Err("请重新从系统拖入这些文件".into());
        }
        for path in &paths {
            grants.remove(path);
        }
    }
    let mut documents = Vec::new();
    let mut assets = Vec::new();
    for path in paths {
        let path = tokio::fs::canonicalize(path)
            .await
            .map_err(|_| "拖入文件不可用")?;
        let result = if is_document(&path) {
            documents::open(&media.state, path)
                .await
                .map(|v| documents.push(v))
        } else {
            media
                .importer
                .file(&path, "attachment")
                .await
                .map(|v| assets.push(v))
        };
        if let Err(error) = result {
            cancel_unlocks(media, &documents).await;
            return Err(error);
        }
    }
    Ok(json!({"documents":documents,"assets":assets}))
}
async fn raw(media: &MediaState, input: Value) -> Result<Value> {
    let files = tokio::task::spawn_blocking(move || parse_raw(input))
        .await
        .map_err(|_| "文件解码任务失败")??;
    let mut documents = Vec::new();
    let mut assets = Vec::new();
    for (name, bytes) in files {
        if is_document(&PathBuf::from(&name)) {
            if name.to_lowercase().ends_with(".xmind") {
                documents.push(
                    tokio::task::spawn_blocking(move || {
                        json!({"path":null,"contents":"","importSource":{"name":name,"bytes":bytes}})
                    })
                    .await
                    .map_err(|_| "导入文档编码任务失败")?,
                );
            } else {
                let directory = super::temporary::Directory::create(
                    media.state.directory.clone(),
                    "raw-document-",
                )
                .await?;
                let path = directory.path().join("import.brainstorming");
                tokio::fs::write(&path, bytes)
                    .await
                    .map_err(|_| "无法暂存导入文档")?;
                match documents::open(&media.state, path).await {
                    Ok(mut value) => {
                        value["path"] = Value::Null;
                        documents.push(value);
                        media.raw_documents.lock().await.push(directory);
                    }
                    Err(error) => {
                        cancel_unlocks(media, &documents).await;
                        return Err(error);
                    }
                }
            }
        } else {
            match media.importer.bytes(bytes, &name, "attachment").await {
                Ok(value) => assets.push(value),
                Err(error) => {
                    cancel_unlocks(media, &documents).await;
                    return Err(error);
                }
            }
        }
    }
    Ok(json!({"documents":documents,"assets":assets}))
}
fn parse_raw(input: Value) -> Result<Vec<(String, Vec<u8>)>> {
    let files = input
        .as_array()
        .filter(|v| !v.is_empty() && v.len() <= 32)
        .ok_or("最多支持 32 个拖入文件")?;
    let mut total = 0usize;
    // Validate the aggregate limit before allocating any decoded byte buffers.
    for file in files {
        total = total
            .checked_add(file["bytes"].as_array().ok_or("文件字节无效")?.len())
            .ok_or("文件超过限制")?;
        if total > 8 * 1024 * 1024 {
            return Err("网页文件导入合计超过 8 MiB，请使用原生文件选择器".into());
        }
        input::text(file, "name", 255)?;
    }
    files
        .iter()
        .map(|file| {
            Ok((
                input::text(file, "name", 255)?.to_owned(),
                input::bytes(&file["bytes"], 8 * 1024 * 1024)?,
            ))
        })
        .collect()
}
fn is_document(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("brainstorming") || s.eq_ignore_ascii_case("xmind"))
}
async fn cancel_unlocks(media: &MediaState, documents: &[Value]) {
    let mut session = media.state.session.lock().await;
    for document in documents {
        if let Some(token) = document["lockedToken"].as_str() {
            session.pending.remove(token);
        }
    }
}
