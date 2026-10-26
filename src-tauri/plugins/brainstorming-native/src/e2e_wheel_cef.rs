use super::{
  e2e_pointer::trusted,
  e2e_pointer_request::{Point, Viewport, validate},
};
use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
use tauri_runtime_cef::{
  WebviewCefExt,
  cef::{ImplBrowser, ImplBrowserHost},
};
use tokio::sync::oneshot;

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

pub(super) async fn call(app: &AppHandle, payload: Value) -> Result<Value, String> {
  let envelope: Envelope = serde_json::from_value(payload).map_err(|_| "原生滚轮参数无效")?;
  let input = envelope.request;
  validate(input.viewport, &[input.point, input.point], 8, 100)?;
  if [input.delta_x, input.delta_y]
    .iter()
    .any(|value| !value.is_finite() || !(-4.0..=4.0).contains(value))
    || (input.delta_x == 0.0 && input.delta_y == 0.0)
  {
    return Err("原生滚轮增量超出范围".into());
  }
  let window = app
    .get_webview_window(&envelope.window_label)
    .ok_or("测试窗口不存在")?;
  if !trusted(app, &window)
    || !window.is_focused().unwrap_or(false)
    || !window.is_visible().unwrap_or(false)
  {
    return Err("原生测试窗口必须可见并处于前台".into());
  }
  let metrics =
    super::cef_commands::request(app, &window, "Page.getLayoutMetrics", json!({})).await?;
  let bounds = &metrics["cssLayoutViewport"];
  if bounds["clientWidth"]
    .as_f64()
    .is_none_or(|value| (value - input.viewport.width).abs() > 1.0)
    || bounds["clientHeight"]
      .as_f64()
      .is_none_or(|value| (value - input.viewport.height).abs() > 1.0)
  {
    return Err("原生测试视口已变化".into());
  }
  let increment = if input.discrete { 100.0 } else { 40.0 };
  super::cef_commands::request(
    app,
    &window,
    "Input.dispatchMouseEvent",
    json!({
      "type":"mouseWheel", "x":input.point.x, "y":input.point.y,
      "deltaX":input.delta_x*increment, "deltaY":input.delta_y*increment,
      "modifiers":if input.control { 2 } else { 0 },
    }),
  )
  .await?;
  let (send, receive) = oneshot::channel();
  window
    .with_cef_webview(move |view| {
      let zoom = view
        .browser()
        .host()
        .map(|host| 1.2_f64.powf(host.zoom_level()));
      let _ = send.send(zoom);
    })
    .map_err(|_| "CEF 缩放读取失败")?;
  let zoom = tokio::time::timeout(std::time::Duration::from_secs(2), receive)
    .await
    .map_err(|_| "CEF 缩放读取超时")?
    .map_err(|_| "CEF 视图已关闭")?
    .ok_or("CEF 缩放不可用")?;
  Ok(json!({"width":input.viewport.width,"height":input.viewport.height,"webviewZoom":zoom}))
}
