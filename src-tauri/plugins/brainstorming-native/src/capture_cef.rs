use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::json;
use std::{
  path::PathBuf,
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
};
use tauri::{AppHandle, WebviewWindow};

pub(super) async fn snapshot(
  app: &AppHandle,
  window: &WebviewWindow,
  output: PathBuf,
  cancelled: Arc<AtomicBool>,
) -> Result<(), String> {
  if cancelled.load(Ordering::Acquire) {
    return Err("网页预览已取消".into());
  }
  let response = super::cef_commands::request(
    app,
    window,
    "Page.captureScreenshot",
    json!({
      "format":"png", "fromSurface":true, "captureBeyondViewport":false,
    }),
  )
  .await?;
  let encoded = response["data"]
    .as_str()
    .filter(|data| data.len() <= 128 * 1024 * 1024)
    .ok_or("CEF 截图无效或超过限制")?
    .to_owned();
  tauri::async_runtime::spawn_blocking(move || {
    if cancelled.load(Ordering::Acquire) {
      return Err("网页预览已取消".into());
    }
    let png = STANDARD.decode(encoded).map_err(|_| "CEF 截图编码无效")?;
    let reader =
      image::ImageReader::with_format(std::io::Cursor::new(&png), image::ImageFormat::Png);
    let (width, height) = reader.into_dimensions().map_err(|_| "CEF 截图尺寸无效")?;
    if width == 0
      || height == 0
      || width > 16384
      || height > 16384
      || u64::from(width) * u64::from(height) > 40_000_000
    {
      return Err("CEF 截图像素超过限制".into());
    }
    std::fs::write(&output, png).map_err(|_| "无法保存网页截图")?;
    if cancelled.load(Ordering::Acquire) {
      let _ = std::fs::remove_file(&output);
      return Err("网页预览已取消".into());
    }
    Ok(())
  })
  .await
  .map_err(|_| "CEF 截图任务中断")?
}
