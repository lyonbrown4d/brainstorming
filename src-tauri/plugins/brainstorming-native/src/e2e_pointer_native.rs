//! AppKit delivery restricted to one live, locally trusted E2E WKWebView.
use super::{
  e2e_pointer::trusted,
  e2e_pointer_request::{Point, Viewport},
};
use objc2_app_kit::{NSApplication, NSEvent, NSEventModifierFlags, NSEventType};
use objc2_foundation::{NSPoint, NSProcessInfo};
use objc2_web_kit::WKWebView;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Runtime, WebviewWindow};
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

pub(super) async fn send<R: Runtime>(
  app: &AppHandle<R>,
  window: &WebviewWindow<R>,
  url: &str,
  viewport: Viewport,
  point: Point,
  phase: Phase,
  delivery: Arc<Mutex<Delivery>>,
) -> Result<isize, String> {
  if !trusted(app, window) || window.url().map_err(|_| "测试页面已关闭")?.as_str() != url {
    return Err("原生测试窗口的授权或页面已变化".into());
  }
  let window_check = window.clone();
  let app_check = app.clone();
  let url = url.to_owned();
  let (sender, receiver) = oneshot::channel();
  window.with_webview(move |webview| {
    let result = (|| {
      if sender.is_closed() {
        return Err("原生测试事件已取消".to_string());
      }
      if !trusted(&app_check, &window_check)
        || window_check.url().map_err(|_| "测试页面已关闭")?.as_str() != url
      {
        return Err("原生测试页面已变化".to_string());
      }
      // SAFETY: Tauri owns this WKWebView and executes this closure on the
      // AppKit main thread. No native reference escapes the closure or yields.
      let view = unsafe { &*(webview.inner() as *mut WKWebView) };
      let native = view.window().ok_or("原生测试窗口已关闭")?;
      let number = native.windowNumber();
      let expected = delivery.lock().map_err(|_| "原生测试状态不可用")?.number;
      if expected != 0 && expected != number {
        return Err("原生测试窗口已更换".into());
      }
      let marker = objc2::MainThreadMarker::new().ok_or("原生测试必须在主线程调度")?;
      if phase != Phase::Up
        && (!NSApplication::sharedApplication(marker).isActive()
          || !native.isKeyWindow()
          || !native.isVisible()
          || native.isMiniaturized()
          || native.attachedSheet().is_some()
          || view.isHiddenOrHasHiddenAncestor())
      {
        return Err("原生测试窗口必须可见并处于前台".into());
      }
      if phase == Phase::Down && NSEvent::pressedMouseButtons() != 0 {
        return Err("有真实鼠标按钮按下，拒绝开始测试输入".into());
      }
      let bounds = view.bounds();
      // Reject zoom/resizing rather than silently delivering to a different hit target.
      if phase != Phase::Up
        && ((bounds.size.width - viewport.width).abs() > 1.0
          || (bounds.size.height - viewport.height).abs() > 1.0
          || unsafe { (view.pageZoom() - 1.0).abs() } > 0.001)
      {
        return Err("原生测试视口已变化或页面缩放不是 100%".into());
      }
      if bounds.size.width <= 0.0 || bounds.size.height <= 0.0 {
        return Err("原生测试视口不可用".into());
      }
      // Up is cleanup only: clamp after a resize and allow the original window
      // to lose focus. It never targets another window or a different page.
      let x = point.x.min(bounds.size.width - 0.01).max(0.0);
      let y = point.y.min(bounds.size.height - 0.01).max(0.0);
      let local = NSPoint::new(bounds.origin.x + x, bounds.origin.y + if view.isFlipped() {
        y
      } else {
        bounds.size.height - y
      });
      let location = view.convertPoint_toView(local, None);
      let kind = match phase {
        Phase::Down => NSEventType::LeftMouseDown,
        Phase::Dragged => NSEventType::LeftMouseDragged,
        Phase::Up => NSEventType::LeftMouseUp,
      };
      let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        kind, location, NSEventModifierFlags::empty(), NSProcessInfo::processInfo().systemUptime(),
        number, None, 0, 1, if phase == Phase::Up { 0.0 } else { 1.0 },
      ).ok_or("无法创建原生测试鼠标事件")?;
      // A timed-out queued event must never become a late Down/Dragged.
      {
        // Coordinate timeout cleanup with the last event about to be delivered.
        // The lock never spans AppKit delivery, a yield, or an await.
        let mut state = delivery.lock().map_err(|_| "原生测试状态不可用")?;
        if sender.is_closed() {
          return Err("原生测试事件已取消".into());
        }
        if phase == Phase::Down { state.number = number; }
        state.point = point;
      }
      native.sendEvent(&event);
      Ok(number)
    })();
    let _ = sender.send(result);
  }).map_err(|_| "无法调度原生测试事件")?;
  receiver.await.map_err(|_| "原生测试事件未返回")?
}
