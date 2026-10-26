//! One bounded CDP observer per live CEF browser; no debugging TCP port is opened.
use serde_json::{Value, json};
use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
  time::Duration,
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_runtime_cef::{DevToolsProtocol, WebviewCefExt, allocate_devtools_message_id};
use tokio::sync::{Mutex as AsyncMutex, oneshot};

type Reply = std::result::Result<Vec<u8>, String>;
type Pending = Arc<Mutex<HashMap<i32, oneshot::Sender<Reply>>>>;
struct RequestGuard {
  pending: Pending,
  id: i32,
}
impl Drop for RequestGuard {
  fn drop(&mut self) {
    if let Ok(mut requests) = self.pending.lock() {
      requests.remove(&self.id);
    }
  }
}
#[derive(Default)]
pub(crate) struct CefCommands(AsyncMutex<HashMap<String, (i32, Pending)>>);

pub(crate) async fn release(app: &AppHandle, label: &str) {
  app.state::<Arc<CefCommands>>().0.lock().await.remove(label);
}

pub(crate) async fn request(
  app: &AppHandle,
  window: &WebviewWindow,
  method: &str,
  params: Value,
) -> Result<Value, String> {
  let (send_identity, identity) = oneshot::channel();
  let label = window.label().to_owned();
  window
    .with_cef_webview(move |view| {
      let state = view.snapshot();
      let identity =
        if state.window_label.as_deref() == Some(label.as_str()) && state.window.is_some() {
          Ok(state.browser_id)
        } else {
          Err("CEF 原生窗口身份不可用".to_string())
        };
      let _ = send_identity.send(identity);
    })
    .map_err(|_| "无法读取 CEF 窗口")?;
  let browser_id = tokio::time::timeout(Duration::from_secs(3), identity)
    .await
    .map_err(|_| "CEF 窗口响应超时")?
    .map_err(|_| "CEF 窗口已关闭")??;
  let state = app.state::<Arc<CefCommands>>();
  let mut browsers = state.0.lock().await;
  let pending = match browsers.get(window.label()) {
    Some((id, pending)) if *id == browser_id => pending.clone(),
    _ => {
      if browsers.len() >= 64 && !browsers.contains_key(window.label()) {
        return Err("CEF 并发窗口超过限制".into());
      }
      let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
      let replies = pending.clone();
      window
        .on_dev_tools_protocol(move |event| {
          if let DevToolsProtocol::MethodResult {
            message_id,
            success,
            result,
          } = event
            && let Ok(mut pending) = replies.lock()
            && let Some(sender) = pending.remove(&message_id)
          {
            let result = if success && result.len() <= 128 * 1024 * 1024 {
              Ok(result)
            } else {
              Err("CEF 请求失败或结果超过限制".into())
            };
            let _ = sender.send(result);
          }
        })
        .map_err(|_| "无法注册 CEF 响应")?;
      browsers.insert(window.label().into(), (browser_id, pending.clone()));
      pending
    }
  };
  drop(browsers);
  let id = allocate_devtools_message_id().map_err(|_| "CEF 请求标识已耗尽")?;
  let (sender, receiver) = oneshot::channel();
  {
    let mut requests = pending.lock().map_err(|_| "CEF 请求状态无效")?;
    if requests.len() >= 16 {
      return Err("CEF 并发请求超过限制".into());
    }
    requests.insert(id, sender);
  }
  let _guard = RequestGuard {
    pending: pending.clone(),
    id,
  };
  let message = serde_json::to_vec(&json!({"id":id,"method":method,"params":params}))
    .map_err(|_| "CEF 请求无效")?;
  if window.send_dev_tools_message(&message).is_err() {
    if let Ok(mut requests) = pending.lock() {
      requests.remove(&id);
    }
    return Err("无法发送 CEF 请求".into());
  }
  let result = tokio::time::timeout(Duration::from_secs(10), receiver).await;
  if let Ok(mut requests) = pending.lock() {
    requests.remove(&id);
  }
  let result = result
    .map_err(|_| "CEF 请求超时")?
    .map_err(|_| "CEF 请求已取消")??;
  serde_json::from_slice(&result).map_err(|_| "CEF 响应无效".into())
}
