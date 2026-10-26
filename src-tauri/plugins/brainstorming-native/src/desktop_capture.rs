use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
  collections::HashMap,
  path::PathBuf,
  sync::{
    Arc, Mutex, OnceLock,
    atomic::{AtomicBool, Ordering},
  },
  time::Duration,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, webview::PageLoadEvent};
use tokio::sync::oneshot;

type Result<T> = std::result::Result<T, String>;
type Active = Mutex<HashMap<String, Arc<AtomicBool>>>;
static ACTIVE: OnceLock<Active> = OnceLock::new();
struct Guard {
  app: AppHandle,
  label: String,
  id: String,
  cancelled: Arc<AtomicBool>,
}
impl Drop for Guard {
  fn drop(&mut self) {
    self.cancelled.store(true, Ordering::Release);
    if let Some(window) = self.app.get_webview_window(&self.label) {
      let _ = window.destroy();
    }
    if let Ok(mut active) = ACTIVE.get_or_init(Default::default).lock() {
      active.remove(&self.id);
    }
  }
}
pub async fn capture(app: &AppHandle, args: Value) -> Result<Value> {
  let id = args["id"]
    .as_str()
    .filter(|v| {
      !v.is_empty() && v.len() <= 80 && v.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    })
    .ok_or("网页预览标识无效")?
    .to_string();
  let html = args["html"]
    .as_str()
    .filter(|s| s.len() <= 4 * 1024 * 1024)
    .ok_or("网页预览内容超过限制")?;
  let output = PathBuf::from(args["outputPath"].as_str().ok_or("网页预览输出无效")?);
  if !output.is_absolute() {
    return Err("网页预览输出无效".into());
  }
  // Local static content only. No script, file access, network, nested browsing or privileged IPC.
  let csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">";
  let encoded = STANDARD.encode(format!("{csp}{html}"));
  let url =
    url::Url::parse(&format!("data:text/html;base64,{encoded}")).map_err(|_| "网页预览地址无效")?;
  let label = format!("preview-{id}");
  let cancelled = Arc::new(AtomicBool::new(false));
  {
    let mut active = ACTIVE
      .get_or_init(Default::default)
      .lock()
      .map_err(|_| "网页预览状态无效")?;
    if active.contains_key(&id) {
      return Err("网页预览请求已存在".into());
    }
    active.insert(id.clone(), cancelled.clone());
  }
  let guard = Guard {
    app: app.clone(),
    label: label.clone(),
    id,
    cancelled: cancelled.clone(),
  };
  let (loaded, ready) = oneshot::channel();
  let loaded = Arc::new(Mutex::new(Some(loaded)));
  let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
    .title("Brainstorming Link Preview")
    .inner_size(1280.0, 720.0)
    .visible(false)
    .decorations(false)
    .skip_taskbar(true)
    .incognito(true)
    .disable_javascript()
    .on_navigation(|url| matches!(url.scheme(), "data" | "about"))
    .on_page_load(move |_, event| {
      if event.event() == PageLoadEvent::Finished {
        if let Ok(mut sender) = loaded.lock() {
          if let Some(sender) = sender.take() {
            let _ = sender.send(());
          }
        }
      }
    })
    .build()
    .map_err(|_| "无法创建隔离网页预览")?;
  let work = async {
    ready.await.map_err(|_| "网页预览加载失败")?;
    tokio::time::sleep(Duration::from_millis(150)).await;
    if cancelled.load(Ordering::Acquire) {
      return Err("网页预览已取消".into());
    }
    super::capture_cef::snapshot(app, &window, output.clone(), cancelled).await?;
    Ok(json!({"outputPath":output}))
  };
  let result = tokio::time::timeout(Duration::from_secs(12), work)
    .await
    .map_err(|_| "网页预览超时".to_string())?;
  drop(guard);
  result
}
pub async fn cancel(app: &AppHandle, args: Value) -> Result<Value> {
  let id = args["id"].as_str().ok_or("网页预览标识无效")?;
  if let Ok(active) = ACTIVE.get_or_init(Default::default).lock() {
    if let Some(cancelled) = active.get(id) {
      cancelled.store(true, Ordering::Release);
    }
  }
  if let Some(window) = app.get_webview_window(&format!("preview-{id}")) {
    let _ = window.destroy();
  }
  Ok(Value::Null)
}

/// Snapshot an already trusted application WebView. Rust selects the window and
/// private output path; no frontend plugin command exposes arbitrary windows.
pub async fn capture_window(app: &AppHandle, args: Value) -> Result<Value> {
  let label = args["windowLabel"].as_str().ok_or("窗口标识无效")?;
  let output = PathBuf::from(args["outputPath"].as_str().ok_or("截图输出无效")?);
  let window = app.get_webview_window(label).ok_or("截图窗口已关闭")?;
  let cancelled = Arc::new(AtomicBool::new(false));
  struct Cancel(Arc<AtomicBool>);
  impl Drop for Cancel {
    fn drop(&mut self) {
      self.0.store(true, Ordering::Release);
    }
  }
  let _guard = Cancel(cancelled.clone());
  super::capture_cef::snapshot(app, &window, output.clone(), cancelled).await?;
  Ok(json!({"outputPath": output}))
}
