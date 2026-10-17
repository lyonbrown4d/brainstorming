use super::{catalog::Catalog, derivative_cache::DerivativeCache, vips};
use crate::runtime::AppState;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{io::Read, path::Path, sync::Arc};
use tokio::sync::Mutex;

pub type Result<T> = std::result::Result<T, String>;
pub struct Importer {
    pub state: Arc<AppState>,
    pub catalog: Arc<Catalog>,
    serial: Mutex<()>,
    derivatives: DerivativeCache,
}
impl Importer {
    pub fn new(state: Arc<AppState>, catalog: Arc<Catalog>) -> Self {
        Self {
            state,
            catalog,
            serial: Mutex::new(()),
            derivatives: DerivativeCache::default(),
        }
    }
    pub async fn file(&self, path: &Path, kind: &str) -> Result<Value> {
        self.file_with_cancel(path, kind, tokio_util::sync::CancellationToken::new())
            .await
    }
    pub async fn file_with_cancel(
        &self,
        path: &Path,
        kind: &str,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let _guard = tokio::select! { biased; _=cancel.cancelled()=>return Err("资源导入已取消".into()),guard=self.serial.lock()=>guard };
        if cancel.is_cancelled() {
            return Err("资源导入已取消".into());
        }
        let path = path.to_owned();
        let inspection = path.clone();
        let (mime, before) = tokio::task::spawn_blocking(move || {
            let mut file = std::fs::File::open(&inspection).map_err(|_| "无法读取资源文件")?;
            let metadata = file.metadata().map_err(|_| "无法读取资源信息")?;
            if !metadata.is_file() || metadata.len() > 64 * 1024u64.pow(3) {
                return Err("资源必须为不超过 64 GiB 的普通文件".into());
            }
            let mut buffer = [0; 4096];
            let length = file.read(&mut buffer).map_err(|_| "无法读取资源文件")?;
            Ok::<_, String>((sniff(&buffer[..length], false), metadata))
        })
        .await
        .map_err(|_| "资源读取任务失败")??;
        let mime = preferred_audio(mime, kind);
        validate_kind(kind, &mime, before.len())?;
        let object = self
            .state
            .vault
            .import_file(&path)
            .await
            .map_err(|e| e.to_string())?;
        let cached = if is_image(&mime) {
            self.derivatives.get(&object.object_id).await
        } else {
            None
        };
        let cache_miss = is_image(&mime) && cached.is_none();
        let image = if cache_miss {
            let parent = self.state.directory.join("image-work");
            let path = path.clone();
            let image_cancel = cancel.clone();
            let image_mime = mime.clone();
            Some(
                tokio::task::spawn_blocking(move || {
                    vips::ensure_codec(&image_mime)?;
                    vips::prepare_file_cancelled(&path, &parent, &image_cancel)
                })
                .await
                .map_err(|_| "图片处理任务失败")??,
            )
        } else {
            None
        };
        let storage = match cached {
            Some(storage) => storage,
            None => self.storage(&object, image).await?,
        };
        if cancel.is_cancelled() {
            return Err("资源导入已取消".into());
        }
        let after = tokio::fs::metadata(&path)
            .await
            .map_err(|_| "导入期间资源已移动")?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err("导入期间资源发生变化，请重新导入".into());
        }
        let asset = self
            .asset(
                &object,
                path.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("attachment"),
                &mime,
                storage.clone(),
            )
            .await?;
        if cancel.is_cancelled() {
            return Err("资源导入已取消".into());
        }
        if cache_miss {
            self.derivatives.insert(&object.object_id, storage).await;
        }
        Ok(asset)
    }
    pub async fn bytes(&self, bytes: Vec<u8>, name: &str, kind: &str) -> Result<Value> {
        let _guard = self.serial.lock().await;
        let mime = sniff(&bytes[..bytes.len().min(4096)], kind == "audio");
        validate_kind(kind, &mime, bytes.len() as u64)?;
        // Ownership moves through workers; the raw byte buffer is never cloned.
        let (bytes, cached) = if is_image(&mime) {
            let (bytes, id) = tokio::task::spawn_blocking(move || {
                let id = hex::encode(Sha256::digest(&bytes));
                (bytes, id)
            })
            .await
            .map_err(|_| "资源摘要任务失败")?;
            (bytes, self.derivatives.get(&id).await)
        } else {
            (bytes, None)
        };
        let cache_miss = is_image(&mime) && cached.is_none();
        let (bytes, image) = if cache_miss {
            let parent = self.state.directory.join("image-work");
            let image_mime = mime.clone();
            let (bytes, image) = tokio::task::spawn_blocking(move || {
                let image = vips::ensure_codec(&image_mime)
                    .and_then(|_| vips::prepare_bytes(&bytes, &parent));
                (bytes, image)
            })
            .await
            .map_err(|_| "图片处理任务失败")?;
            (bytes, Some(image?))
        } else {
            (bytes, None)
        };
        let object = self
            .state
            .vault
            .import_bytes(bytes)
            .await
            .map_err(|e| e.to_string())?;
        let storage = match cached {
            Some(storage) => storage,
            None => self.storage(&object, image).await?,
        };
        let asset = self.asset(&object, name, &mime, storage.clone()).await?;
        if cache_miss {
            self.derivatives.insert(&object.object_id, storage).await;
        }
        Ok(asset)
    }
}
fn preferred_audio(mime: String, kind: &str) -> String {
    if kind == "audio" && mime == "video/webm" {
        "audio/webm".into()
    } else {
        mime
    }
}
fn validate_kind(kind: &str, mime: &str, length: u64) -> Result<()> {
    if kind == "image" && !is_image(mime) {
        return Err("请选择支持的位图文件".into());
    }
    if kind == "audio"
        && !matches!(
            mime,
            "audio/mpeg"
                | "audio/wav"
                | "audio/ogg"
                | "audio/webm"
                | "audio/mp4"
                | "audio/aac"
                | "audio/flac"
        )
    {
        return Err("请选择支持的音频文件".into());
    }
    if is_image(mime) && (length == 0 || length > 1024u64.pow(3)) {
        return Err("图片必须为 1 字节至 1 GiB".into());
    }
    Ok(())
}
fn is_image(mime: &str) -> bool {
    matches!(
        mime,
        "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/tiff" | "image/avif"
    )
}
pub fn sniff(bytes: &[u8], prefer_audio: bool) -> String {
    let detected = infer::get(bytes)
        .map(|info| info.mime_type())
        .unwrap_or("application/octet-stream");
    let detected = match detected {
        "audio/x-wav" => "audio/wav",
        "audio/x-flac" => "audio/flac",
        "audio/x-m4a" | "audio/m4a" => "audio/mp4",
        other => other,
    };
    preferred_audio(
        detected.into(),
        if prefer_audio { "audio" } else { "attachment" },
    )
}
