use super::input::{self, Result};
use serde_json::Value;
use tauri::AppHandle;
const PREFIX: &str = "Brainstorming topics v1\n";
#[cfg(not(target_os = "macos"))]
const MIME: &str = "application/vnd.brainstorming.topics+json";
#[cfg(target_os = "macos")]
const NATIVE_FORMAT: &str = "app.brainstorming.topic-tree-json";
#[cfg(all(desktop, not(target_os = "macos")))]
const NATIVE_FORMAT: &str = MIME;
const LIMIT: usize = 56 * 1024 * 1024;
pub fn validate(contents: &str) -> Result<()> {
  if contents.len() > LIMIT {
    return Err("剪贴板内容过大".into());
  }
  let data = contents.strip_prefix(PREFIX).ok_or("剪贴板主题格式无效")?;
  let parsed: Value = serde_json::from_str(data).map_err(|_| "剪贴板主题格式无效")?;
  if !parsed.is_object() {
    return Err("剪贴板主题格式无效".into());
  }
  // Full tree/resource validation is also performed by the shared core before applying a paste.
  Ok(())
}
#[cfg(desktop)]
fn context() -> Result<&'static std::sync::Mutex<clipboard_rs::ClipboardContext>> {
  static CLIPBOARD: std::sync::OnceLock<std::sync::Mutex<clipboard_rs::ClipboardContext>> =
    std::sync::OnceLock::new();
  if let Some(context) = CLIPBOARD.get() {
    return Ok(context);
  }
  let context = clipboard_rs::ClipboardContext::new().map_err(|_| "系统剪贴板不可用")?;
  let _ = CLIPBOARD.set(std::sync::Mutex::new(context));
  CLIPBOARD.get().ok_or_else(|| "系统剪贴板不可用".into())
}
pub async fn write(app: &AppHandle, value: &Value) -> Result<()> {
  let contents = input::text(value, "contents", LIMIT)?;
  validate(contents)?;
  let plain = input::text(value, "plainText", 10 * 1024 * 1024)?;
  #[cfg(desktop)]
  {
    use clipboard_rs::{Clipboard, ClipboardContent};
    let _ = app;
    let contents = contents.to_string();
    let plain = plain.to_string();
    tokio::task::spawn_blocking(move || -> Result<()> {
      let clipboard = context()?.lock().map_err(|_| "系统剪贴板不可用")?;
      clipboard
        .set(vec![
          ClipboardContent::Text(plain),
          ClipboardContent::Other(NATIVE_FORMAT.to_string(), contents.into_bytes()),
        ])
        .map_err(|_| "无法写入系统剪贴板".to_string())?;
      if !clipboard
        .available_formats()
        .map_err(|_| "无法检查系统剪贴板")?
        .iter()
        .any(|format| format == NATIVE_FORMAT)
      {
        return Err("系统剪贴板未保留主题数据，请重试".into());
      }
      Ok(())
    })
    .await
    .map_err(|_| "系统剪贴板任务失败")??;
  }
  #[cfg(mobile)]
  {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    app
      .native_bridge()
      .call(
        "writeClipboard",
        serde_json::json!({"contents":contents,"plainText":plain,"mimeType":MIME}),
      )
      .await
      .map_err(|_| "无法写入系统剪贴板")?;
  }
  Ok(())
}
pub async fn read(app: &AppHandle) -> Result<String> {
  #[cfg(desktop)]
  let contents = {
    use clipboard_rs::Clipboard;
    let _ = app;
    tokio::task::spawn_blocking(|| {
      let clipboard = context()?.lock().map_err(|_| "系统剪贴板不可用")?;
      if clipboard
        .available_formats()
        .map_err(|_| "无法读取系统剪贴板")?
        .iter()
        .any(|v| v == NATIVE_FORMAT)
      {
        String::from_utf8(
          clipboard
            .get_buffer(NATIVE_FORMAT)
            .map_err(|_| "无法读取主题剪贴板")?,
        )
        .map_err(|_| "剪贴板文本编码无效".to_string())
      } else {
        clipboard
          .get_text()
          .map_err(|_| "无法读取系统剪贴板".to_string())
      }
    })
    .await
    .map_err(|_| "系统剪贴板任务失败")??
  };
  #[cfg(mobile)]
  let contents = {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    let value = app
      .native_bridge()
      .call("readClipboard", serde_json::json!({"mimeType":MIME}))
      .await
      .map_err(|_| "无法读取系统剪贴板")?;
    value["contents"]
      .as_str()
      .ok_or("剪贴板内容无效")?
      .to_string()
  };
  if contents.len() > LIMIT {
    return Err("剪贴板内容过大".into());
  }
  if contents.starts_with(PREFIX) {
    validate(&contents)?;
  }
  Ok(contents)
}
