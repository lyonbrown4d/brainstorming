use super::{Result, error::invalid, validation::text};
use serde_json::Value;

/// Inline payloads come from bounded interchange imports. Original file-backed
/// resources are validated by the native media importer before staging.
pub(crate) fn validate(asset: &Value, bytes: &[u8]) -> Result<Option<(u64, u64)>> {
    let detected = infer::get(bytes)
        .map(|kind| kind.mime_type())
        .unwrap_or("application/octet-stream");
    let normalized = match detected {
        "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "audio/mpeg" | "audio/wav"
        | "audio/ogg" | "audio/webm" | "audio/mp4" | "audio/aac" | "audio/flac" => detected,
        "audio/x-wav" | "audio/vnd.wave" => "audio/wav",
        "audio/x-flac" => "audio/flac",
        "audio/opus" | "application/ogg" => "audio/ogg",
        "video/mp4" | "audio/x-m4a" => "audio/mp4",
        "video/webm" => "audio/webm",
        _ => "application/octet-stream",
    };
    let mime = text(&asset["mimeType"])?;
    if mime != normalized
        && !(mime == "application/octet-stream" && normalized.starts_with("audio/"))
    {
        return Err(invalid("资源 MIME 类型与实际内容不一致"));
    }
    let name = text(&asset["name"])?;
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let reserved = ["con", "prn", "aux", "nul"].contains(&stem.as_str())
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && (b'1'..=b'9').contains(&stem.as_bytes()[3]));
    if name.len() > 200
        || name != name.trim()
        || name.ends_with('.')
        || name.chars().any(|c| "<>:\"|?*".contains(c))
        || reserved
    {
        return Err(invalid("资源名称须使用已规范化的安全文件名"));
    }
    if !normalized.starts_with("image/") {
        return Ok(None);
    }
    let dimensions = imagesize::blob_size(bytes).map_err(|_| invalid("图片头无效或不完整"))?;
    let (width, height) = (dimensions.width as u64, dimensions.height as u64);
    if width == 0 || height == 0 || width > 8192 || height > 8192 || width * height > 40_000_000 {
        return Err(invalid("内联图片尺寸超过限制"));
    }
    Ok(Some((width, height)))
}
