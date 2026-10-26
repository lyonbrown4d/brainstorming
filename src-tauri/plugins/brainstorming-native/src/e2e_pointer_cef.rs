//! CEF's own input dispatch, scoped to the admitted E2E browser on every desktop.
use super::{
  e2e_pointer::trusted,
  e2e_pointer_request::{Point, Viewport},
};
use serde_json::json;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, WebviewWindow};
use tauri_runtime_cef::WebviewCefExt;
use tokio::sync::oneshot;

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Phase {
  Down,
  Dragged,
  Up,
}
pub(super) struct Delivery {
  pub number: isize,
  pub point: Point,
}

pub(super) async fn send(
  app: &AppHandle,
  window: &WebviewWindow,
  url: &str,
  viewport: Viewport,
  point: Point,
  phase: Phase,
  delivery: Arc<Mutex<Delivery>>,
) -> Result<isize, String> {
  if !trusted(app, window) || window.url().map_err(|_| "测试页面已关闭")?.as_str() != url {
    return Err("原生测试窗口的授权或页面已变化".into());
  }
  if phase != Phase::Up
    && (!window.is_focused().unwrap_or(false) || !window.is_visible().unwrap_or(false))
  {
    return Err("原生测试窗口必须可见并处于前台".into());
  }
  let (sender, receiver) = oneshot::channel();
  window
    .with_cef_webview(move |view| {
      let state = view.snapshot();
      let valid = state.document.is_some()
        && state.window.is_some()
        && (phase == Phase::Up || state.visible == Some(true));
      let _ = sender.send(if valid {
        Ok(state.browser_id as isize)
      } else {
        Err("原生测试视图不可用".to_string())
      });
    })
    .map_err(|_| "无法访问 CEF 测试视图")?;
  let number = tokio::time::timeout(std::time::Duration::from_secs(2), receiver)
    .await
    .map_err(|_| "原生测试视图超时")?
    .map_err(|_| "原生测试视图已关闭")??;
  let expected = delivery.lock().map_err(|_| "原生测试状态不可用")?.number;
  if expected != 0 && expected != number {
    return Err("原生测试窗口已更换".into());
  }
  if phase != Phase::Up {
    let metrics =
      super::cef_commands::request(app, window, "Page.getLayoutMetrics", json!({})).await?;
    let bounds = &metrics["cssLayoutViewport"];
    if bounds["clientWidth"]
      .as_f64()
      .is_none_or(|width| (width - viewport.width).abs() > 1.0)
      || bounds["clientHeight"]
        .as_f64()
        .is_none_or(|height| (height - viewport.height).abs() > 1.0)
    {
      return Err("原生测试视口已变化".into());
    }
  }
  // Record before dispatch so timeout/cancellation still balances a possible Down.
  {
    let mut state = delivery.lock().map_err(|_| "原生测试状态不可用")?;
    if phase == Phase::Down {
      state.number = number;
    }
    state.point = point;
  }
  let kind = match phase {
    Phase::Down => "mousePressed",
    Phase::Dragged => "mouseMoved",
    Phase::Up => "mouseReleased",
  };
  super::cef_commands::request(
    app,
    window,
    "Input.dispatchMouseEvent",
    json!({
      "type":kind, "x":point.x, "y":point.y, "button":"left",
      "buttons":if phase == Phase::Up { 0 } else { 1 }, "clickCount":1, "pointerType":"mouse",
    }),
  )
  .await?;
  let mut state = delivery.lock().map_err(|_| "原生测试状态不可用")?;
  if phase == Phase::Down {
    state.number = number;
  }
  state.point = point;
  Ok(number)
}
