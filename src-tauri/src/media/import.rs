use super::{catalog::Catalog, vips};
use crate::runtime::AppState;
use serde_json::{Value, json};
use std::{io::Read, path::Path, sync::Arc};
use tokio::sync::Mutex;

pub type Result<T> = std::result::Result<T, String>;
pub struct Importer {
    pub state: Arc<AppState>,
    pub catalog: Arc<Catalog>,
    serial: Mutex<()>,
}
impl Importer {
    pub fn new(state: Arc<AppState>, catalog: Arc<Catalog>) -> Self {
        Self {
            state,
            catalog,
            serial: Mutex::new(()),
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
        let image = if is_image(&mime) {
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
        if cancel.is_cancelled() {
            return Err("资源导入已取消".into());
        }
        let after = tokio::fs::metadata(&path)
            .await
            .map_err(|_| "导入期间资源已移动")?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err("导入期间资源发生变化，请重新导入".into());
        }
        self.finish(
            object,
            path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("attachment"),
            &mime,
            image,
        )
        .await
    }
    pub async fn bytes(&self, bytes: Vec<u8>, name: &str, kind: &str) -> Result<Value> {
        let _guard = self.serial.lock().await;
        let mime = sniff(&bytes[..bytes.len().min(4096)], kind == "audio");
        validate_kind(kind, &mime, bytes.len() as u64)?;
        let image = if is_image(&mime) {
            let parent = self.state.directory.join("image-work");
            let (bytes, image) = tokio::task::spawn_blocking(move || {
                let image = vips::ensure_codec(&sniff(&bytes[..bytes.len().min(4096)], false))
                    .and_then(|_| vips::prepare_bytes(&bytes, &parent));
                (bytes, image)
            })
            .await
            .map_err(|_| "图片处理任务失败")?;
            let object = self
                .state
                .vault
                .import_bytes(bytes)
                .await
                .map_err(|e| e.to_string())?;
            return self.finish(object, name, &mime, Some(image?)).await;
        } else {
            None
        };
        let object = self
            .state
            .vault
            .import_bytes(bytes)
            .await
            .map_err(|e| e.to_string())?;
        self.finish(object, name, &mime, image).await
    }
    async fn finish(
        &self,
        object: crate::document::ResourceObject,
        name: &str,
        mime: &str,
        image: Option<vips::Artifacts>,
    ) -> Result<Value> {
        let mut storage = json!({"objectId":object.object_id,"byteLength":object.byte_length});
        if let Some(image) = image {
            let preview = self
                .state
                .vault
                .import_file(&image.preview)
                .await
                .map_err(|e| e.to_string())?;
            self.catalog
                .register_vault(&preview.object_id, preview.byte_length, "image/webp")
                .await;
            let mut derivatives = crate::document::Derivatives {
                preview: Some(crate::document::Preview {
                    object_id: preview.object_id.clone(),
                    mime_type: "image/webp".into(),
                    width: image.preview_width,
                    height: image.preview_height,
                }),
                tiles: Vec::new(),
            };
            for (level, x, y, path) in image.tiles {
                let tile = self
                    .state
                    .vault
                    .import_file(&path)
                    .await
                    .map_err(|e| e.to_string())?;
                self.catalog
                    .register_vault(&tile.object_id, tile.byte_length, "image/webp")
                    .await;
                derivatives.tiles.push(crate::document::Tile {
                    object_id: tile.object_id,
                    level,
                    x,
                    y,
                });
            }
            self.state
                .vault
                .set_derivatives(&object.object_id, derivatives)
                .await
                .map_err(|e| e.to_string())?;
            storage["width"] = json!(image.width);
            storage["height"] = json!(image.height);
            storage["preview"] = json!({"objectId":preview.object_id,"byteLength":preview.byte_length,
                "mimeType":"image/webp","width":image.preview_width,"height":image.preview_height});
            storage["tiles"] = json!({"tileSize":512,"overlap":1,"maxLevel":u32::BITS-(image.width.max(image.height)-1).leading_zeros(),
                "width":image.width,"height":image.height,"format":"webp","pipelineVersion":1});
            image.directory.close().await?;
        }
        self.catalog
            .register_vault(&object.object_id, object.byte_length, mime)
            .await;
        Ok(
            json!({"id":uuid::Uuid::new_v4().to_string(),"name":crate::runtime::input::safe_name(name),"mimeType":mime,"storage":storage}),
        )
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
