//! GTK delivery to one live E2E WebView, without moving the desktop pointer.
use super::{
  e2e_pointer::trusted,
  e2e_pointer_request::{Point, Viewport},
};
use gtk::{gdk, glib::translate::*, prelude::*};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Runtime, WebviewWindow};
use tokio::sync::oneshot;
use webkit2gtk::WebViewExt;

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Phase {
  Down,
  Dragged,
  Up,
}

pub(super) struct Delivery {
  pub number: isize,
  pub point: Point,
  pub bounds: Option<(i32, i32)>,
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
  window
    .with_webview(move |webview| {
      let result = (|| {
        if sender.is_closed() {
          return Err("原生测试事件已取消".to_string());
        }
        if !trusted(&app_check, &window_check)
          || window_check.url().map_err(|_| "测试页面已关闭")?.as_str() != url
        {
          return Err("原生测试页面已变化".into());
        }
        let view = webview.inner();
        let native = view.window().ok_or("原生测试窗口已关闭")?;
        let number = native.as_ptr() as isize;
        let expected = delivery.lock().map_err(|_| "原生测试状态不可用")?.number;
        if expected != 0 && expected != number {
          return Err("原生测试窗口已更换".into());
        }
        if phase != Phase::Up
          && (!window_check.is_focused().unwrap_or(false)
            || !view.is_drawable()
            || !view.is_sensitive())
        {
          return Err("原生测试窗口必须可见并处于前台".into());
        }
        let width = f64::from(view.allocated_width());
        let height = f64::from(view.allocated_height());
        let scale_x = width / viewport.width;
        let scale_y = height / viewport.height;
        let bounds = delivery.lock().map_err(|_| "原生测试状态不可用")?.bounds;
        if phase != Phase::Up
          && (bounds
            .is_some_and(|before| before != (view.allocated_width(), view.allocated_height()))
            || (scale_x - scale_y).abs() > 0.02
            || (view.zoom_level() - 1.0).abs() > 0.001)
        {
          return Err("原生测试视口已变化或页面缩放不是 100%".into());
        }
        if width <= 0.0 || height <= 0.0 {
          return Err("原生测试视口不可用".into());
        }
        let device = view
          .display()
          .default_seat()
          .and_then(|seat| seat.pointer())
          .ok_or("原生测试指针设备不可用")?;
        let native_point = Point {
          x: (point.x * scale_x).min(width - 0.01).max(0.0),
          y: (point.y * scale_y).min(height - 0.01).max(0.0),
        };
        let kind = match phase {
          Phase::Down => gdk::EventType::ButtonPress,
          Phase::Dragged => gdk::EventType::MotionNotify,
          Phase::Up => gdk::EventType::ButtonRelease,
        };
        let mut event = gdk::Event::new(kind);
        // GDK owns this additional window reference until it frees the event.
        let any: &mut gdk::ffi::GdkEventAny = event.as_mut();
        any.window = native.to_glib_full();
        event.set_device(Some(&device));
        event.set_source_device(Some(&device));
        let time = (gtk::glib::monotonic_time() / 1000) as u32;
        let state = if phase == Phase::Down {
          0
        } else {
          gdk::ffi::GDK_BUTTON1_MASK
        };
        if let Some(motion) = event.downcast_mut::<gdk::EventMotion>() {
          let fields: &mut gdk::ffi::GdkEventMotion = motion.as_mut();
          fields.time = time;
          fields.x = native_point.x;
          fields.y = native_point.y;
          fields.state = state;
        } else if let Some(button) = event.downcast_mut::<gdk::EventButton>() {
          let fields: &mut gdk::ffi::GdkEventButton = button.as_mut();
          fields.time = time;
          fields.x = native_point.x;
          fields.y = native_point.y;
          fields.button = 1;
          fields.state = state;
        }
        {
          let mut state = delivery.lock().map_err(|_| "原生测试状态不可用")?;
          if sender.is_closed() {
            return Err("原生测试事件已取消".into());
          }
          if phase == Phase::Down {
            state.number = number;
            state.bounds = Some((view.allocated_width(), view.allocated_height()));
          }
          state.point = point;
        }
        // GTK/WebKit performs hit testing, PointerEvent translation and capture.
        // No browser events or browser trust/selection state are constructed here.
        view.event(&event);
        Ok(number)
      })();
      let _ = sender.send(result);
    })
    .map_err(|_| "无法调度原生测试事件")?;
  receiver.await.map_err(|_| "原生测试事件未返回")?
}
