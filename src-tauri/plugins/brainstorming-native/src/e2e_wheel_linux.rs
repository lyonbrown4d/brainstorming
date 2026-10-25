//! Bounded GTK scroll input for Linux WebKit integration tests, never DOM events.
use super::{
  e2e_pointer::trusted,
  e2e_pointer_request::{Point, Viewport, validate},
};
use gtk::{gdk, glib::translate::*, prelude::*};
use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::oneshot;
use webkit2gtk::WebViewExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Wheel {
  viewport: Viewport,
  point: Point,
  delta_x: f64,
  delta_y: f64,
  control: bool,
  #[serde(default)]
  discrete: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
  window_label: String,
  request: Wheel,
}

pub(super) async fn call<R: Runtime>(app: &AppHandle<R>, payload: Value) -> Result<Value, String> {
  let envelope: Envelope = serde_json::from_value(payload).map_err(|_| "原生滚轮参数无效")?;
  let input = envelope.request;
  validate(input.viewport, &[input.point, input.point], 8, 100)?;
  if [input.delta_x, input.delta_y]
    .iter()
    .any(|delta| !delta.is_finite() || !(-4.0..=4.0).contains(delta))
    || (input.delta_x == 0.0 && input.delta_y == 0.0)
  {
    return Err("原生滚轮增量超出范围".into());
  }
  let window = app
    .get_webview_window(&envelope.window_label)
    .ok_or("测试窗口不存在")?;
  if !trusted(app, &window) {
    return Err("此窗口无权使用原生测试滚轮".into());
  }
  let window_check = window.clone();
  let app_check = app.clone();
  let url = window.url().map_err(|_| "测试页面不可用")?;
  let (sender, receiver) = oneshot::channel();
  window
    .with_webview(move |webview| {
      let result = (|| {
        if sender.is_closed()
          || !trusted(&app_check, &window_check)
          || window_check.url().map_err(|_| "测试页面不可用")? != url
        {
          return Err("原生滚轮已取消或页面已变化".to_string());
        }
        let view = webview.inner();
        if !window_check.is_focused().unwrap_or(false) || !view.is_drawable() {
          return Err("原生测试窗口必须可见并处于前台".into());
        }
        let native = view.window().ok_or("测试窗口已关闭")?;
        let device = view
          .display()
          .default_seat()
          .and_then(|seat| seat.pointer())
          .ok_or("原生滚轮设备不可用")?;
        let width = f64::from(view.allocated_width());
        let height = f64::from(view.allocated_height());
        let scale_x = width / input.viewport.width;
        let scale_y = height / input.viewport.height;
        if width <= 0.0 || height <= 0.0 || (scale_x - scale_y).abs() > 0.02 {
          return Err("原生滚轮视口已变化".into());
        }
        let mut event = gdk::Event::new(gdk::EventType::Scroll);
        // GDK owns the additional reference while the scoped event is alive.
        let any: &mut gdk::ffi::GdkEventAny = event.as_mut();
        any.window = native.to_glib_full();
        event.set_device(Some(&device));
        event.set_source_device(Some(&device));
        let scroll = event
          .downcast_mut::<gdk::EventScroll>()
          .ok_or("无法创建滚轮事件")?;
        let fields: &mut gdk::ffi::GdkEventScroll = scroll.as_mut();
        fields.time = (gtk::glib::monotonic_time() / 1000) as u32;
        fields.x = input.point.x * scale_x;
        fields.y = input.point.y * scale_y;
        fields.direction = if input.discrete {
          if input.delta_y < 0.0 {
            gdk::ffi::GDK_SCROLL_UP
          } else {
            gdk::ffi::GDK_SCROLL_DOWN
          }
        } else {
          gdk::ffi::GDK_SCROLL_SMOOTH
        };
        fields.delta_x = if input.discrete { 0.0 } else { input.delta_x };
        fields.delta_y = if input.discrete { 0.0 } else { input.delta_y };
        fields.state = if input.control {
          gdk::ffi::GDK_CONTROL_MASK
        } else {
          0
        };
        let zoom = view.zoom_level();
        view.event(&event);
        Ok(json!({"webviewZoom":zoom,"width":width,"height":height}))
      })();
      let _ = sender.send(result);
    })
    .map_err(|_| "无法调度原生滚轮")?;
  tokio::time::timeout(std::time::Duration::from_secs(2), receiver)
    .await
    .map_err(|_| "原生滚轮超时")?
    .map_err(|_| "原生滚轮未返回")?
}
