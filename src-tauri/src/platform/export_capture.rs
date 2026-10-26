use crate::{compute::wire::JsonValue, document_exports::Page};
use serde::Deserialize;
use tauri::{AppHandle, WebviewWindow};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bounds {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
  viewport_width: f64,
  viewport_height: f64,
}
impl Bounds {
  fn validate(&self) -> Result<(), String> {
    let values = [
      self.x,
      self.y,
      self.width,
      self.height,
      self.viewport_width,
      self.viewport_height,
    ];
    if values.iter().any(|value| !value.is_finite())
      || self.x < 0.0
      || self.y < 0.0
      || self.width < 1.0
      || self.height < 1.0
      || self.viewport_width > 16384.0
      || self.viewport_height > 16384.0
      || self.x + self.width > self.viewport_width + 1.0
      || self.y + self.height > self.viewport_height + 1.0
    {
      return Err("截图区域无效，请重新打开导出".into());
    }
    Ok(())
  }
}
#[tauri3_specta::command]
pub async fn document_export_capture(
  app: AppHandle,
  window: WebviewWindow,
  input: JsonValue,
) -> Result<JsonValue, String> {
  if window.label() == "splash" || !super::request::trusted(&window, &app) {
    return Err("此窗口无权导出画面".into());
  }
  let state = super::initialization::ready(&app)
    .await?
    .for_window(window.label())
    .await?;
  let _admission = super::initialization::acquire(&app).await?;
  let bounds: Bounds = serde_json::from_value(input.0).map_err(|_| "截图区域无效")?;
  bounds.validate()?;
  let size = window.inner_size().map_err(|_| "窗口不可用")?;
  if u64::from(size.width) * u64::from(size.height) > 40_000_000 {
    return Err("窗口截图超过 4000 万像素限制".into());
  }
  #[cfg(desktop)]
  {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    static CAPTURE: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);
    let _permit = CAPTURE.acquire().await.map_err(|_| "截图服务已关闭")?;
    let directory = tempfile::tempdir().map_err(|_| "无法创建截图临时目录")?;
    let path = directory.path().join("view.png");
    app
      .native_bridge()
      .call(
        "captureWindowView",
        serde_json::json!({"windowLabel":state.window_id,"outputPath":path}),
      )
      .await?;
    if tokio::fs::metadata(&path)
      .await
      .map_err(|_| "无法读取截图")?
      .len()
      > 64 * 1024 * 1024
    {
      return Err("截图超过大小限制".into());
    }
    let bytes = tokio::fs::read(&path).await.map_err(|_| "无法读取截图")?;
    let page = state.compute.run(move || crop(bytes, bounds)).await?;
    serde_json::to_value(page)
      .map(JsonValue)
      .map_err(|_| "截图数据无效".into())
  }
  #[cfg(mobile)]
  {
    let _ = (state, bounds);
    Err("当前平台暂不支持当前视角截图，请导出完整导图".into())
  }
}
#[cfg(desktop)]
fn crop(bytes: Vec<u8>, bounds: Bounds) -> Result<Page, String> {
  use base64::Engine;
  let mut reader =
    image::ImageReader::with_format(std::io::Cursor::new(bytes), image::ImageFormat::Png);
  let mut limits = image::Limits::default();
  limits.max_image_width = Some(16384);
  limits.max_image_height = Some(16384);
  limits.max_alloc = Some(160_000_000);
  reader.limits(limits);
  let image = reader.decode().map_err(|_| "截图解码失败")?;
  let sx = image.width() as f64 / bounds.viewport_width;
  let sy = image.height() as f64 / bounds.viewport_height;
  let x = (bounds.x * sx).round() as u32;
  let y = (bounds.y * sy).round() as u32;
  let width = (bounds.width * sx).round().max(1.0) as u32;
  let height = (bounds.height * sy).round().max(1.0) as u32;
  if x + width > image.width() || y + height > image.height() {
    return Err("截图区域超出窗口".into());
  }
  let mut png = std::io::Cursor::new(Vec::new());
  image
    .crop_imm(x, y, width, height)
    .write_to(&mut png, image::ImageFormat::Png)
    .map_err(|_| "截图编码失败")?;
  let encoded = base64::engine::general_purpose::STANDARD.encode(png.into_inner());
  Ok(Page {
    title: "3D".into(),
    width: width as f64,
    height: height as f64,
    svg: format!(
      "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\"><image width=\"{width}\" height=\"{height}\" href=\"data:image/png;base64,{encoded}\"/></svg>"
    ),
  })
}
