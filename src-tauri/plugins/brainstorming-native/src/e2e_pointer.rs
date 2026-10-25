//! E2E-only native mouse gestures. Start returns before input; status/release
//! let the browser observer inspect native event effects before sending Up.
//! Browser trust, pressed buttons, and pointer capture require real verification.
use super::{
  e2e_pointer_native as native,
  e2e_pointer_request::{Point, Request, Viewport, validate},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::{
  Arc,
  atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tokio::{
  sync::{Mutex, Notify},
  time::{Duration, Instant},
};

type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub(crate) struct Adapter {
  next: AtomicU64,
  session: Mutex<Option<Arc<Session>>>,
}

struct Session {
  id: String,
  label: String,
  release: Notify,
  status: Mutex<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
  window_label: String,
  request: Request,
}

pub(super) fn trusted<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) -> bool {
  let Ok(url) = window.url() else { return false };
  app.config().identifier == "app.brainstorming.e2e"
    && (window.label() == "main" || window.label().starts_with("editor-"))
    && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
      || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
      || (cfg!(debug_assertions)
        && app
          .config()
          .build
          .dev_url
          .as_ref()
          .is_some_and(|dev| url.origin() == dev.origin())))
}

pub(crate) async fn call<R: Runtime>(app: &AppHandle<R>, payload: Value) -> Result<Value> {
  if app.config().identifier != "app.brainstorming.e2e" || payload.to_string().len() > 32_768 {
    return Err("此应用无权使用原生测试输入或请求超限".into());
  }
  let envelope: Envelope = serde_json::from_value(payload).map_err(|_| "原生测试输入参数无效")?;
  let window = app
    .get_webview_window(&envelope.window_label)
    .ok_or("原生测试窗口不存在")?;
  if !trusted(app, &window) {
    return Err("此窗口无权使用原生测试输入".into());
  }
  let adapter = app.state::<Arc<Adapter>>();
  let releasing = matches!(envelope.request, Request::Release { .. });
  match envelope.request {
    Request::Start {
      viewport,
      points,
      step_ms,
      hold_ms,
    } => {
      validate(viewport, &points, step_ms, hold_ms)?;
      let mut active = adapter.session.lock().await;
      if let Some(session) = active.as_ref() {
        let status = session.status.lock().await;
        if status["done"] != true {
          return Err("已有原生测试指针操作，拒绝并发输入".into());
        }
        if !status["cleanupError"].is_null() {
          return Err("上次原生测试清理失败，请重启独立测试应用".into());
        }
      }
      let id = (adapter.next.fetch_add(1, Ordering::Relaxed) + 1).to_string();
      let session = Arc::new(Session {
        id: id.clone(),
        label: window.label().to_owned(),
        release: Notify::new(),
        status: Mutex::new(json!({"gestureId":id,"phase":"queued","done":false,
          "events":0,"error":null,"cleanupError":null,"automaticRelease":false})),
      });
      let url = window.url().map_err(|_| "原生测试页面不可用")?.to_string();
      let task_app = app.clone();
      let task_session = session.clone();
      // The task owns cleanup even if the invoking IPC future is dropped.
      tauri::async_runtime::spawn(async move {
        run(
          task_app,
          window,
          url,
          task_session,
          viewport,
          points,
          step_ms,
          hold_ms,
        )
        .await;
      });
      *active = Some(session);
      Ok(json!({"gestureId":id,"phase":"queued"}))
    }
    Request::Status { gesture_id } | Request::Release { gesture_id } => {
      let active = adapter.session.lock().await;
      let session = active.as_ref().ok_or("没有原生测试指针操作")?;
      if session.id != gesture_id || session.label != window.label() {
        return Err("原生测试操作不属于当前窗口或已过期".into());
      }
      // A Notify permit is retained even when release arrives before held.
      if releasing {
        session.release.notify_one();
      }
      Ok(session.status.lock().await.clone())
    }
  }
}

async fn run<R: Runtime>(
  app: AppHandle<R>,
  window: WebviewWindow<R>,
  url: String,
  session: Arc<Session>,
  viewport: Viewport,
  points: Vec<Point>,
  step_ms: u64,
  hold_ms: u64,
) {
  let delivery = Arc::new(std::sync::Mutex::new(native::Delivery {
    number: 0,
    point: points[0],
    #[cfg(target_os = "linux")]
    bounds: None,
  }));
  let mut last = points[0];
  let mut events = 0_u64;
  let started = Instant::now();
  let timed = tokio::time::timeout(Duration::from_secs(10), async {
    native::send(
      &app,
      &window,
      &url,
      viewport,
      last,
      native::Phase::Down,
      delivery.clone(),
    )
    .await?;
    events += 1;
    session.status.lock().await["phase"] = json!("moving");
    for point in &points[1..] {
      if tokio::time::timeout(Duration::from_millis(step_ms), session.release.notified())
        .await
        .is_ok()
      {
        return Ok(());
      }
      if started.elapsed() > Duration::from_secs(6) {
        return Err("原生测试拖动超时".into());
      }
      native::send(
        &app,
        &window,
        &url,
        viewport,
        *point,
        native::Phase::Dragged,
        delivery.clone(),
      )
      .await?;
      last = *point;
      events += 1;
      session.status.lock().await["events"] = json!(events);
    }
    session.status.lock().await["phase"] = json!("held");
    let automatic =
      tokio::time::timeout(Duration::from_millis(hold_ms), session.release.notified())
        .await
        .is_err();
    session.status.lock().await["automaticRelease"] = json!(automatic);
    if automatic {
      return Err("原生测试指针持有超时，已自动释放".into());
    }
    Ok(())
  })
  .await;
  if timed.is_err() {
    session.status.lock().await["automaticRelease"] = json!(true);
  }
  let result = timed.unwrap_or_else(|_| Err("原生测试操作超过 10 秒，已请求释放".into()));
  // Always balance a successfully delivered Down. Cleanup may release only the
  // original live page/window, including after blur or resize; never global input.
  let (pressed, release_point) = delivery
    .lock()
    .map(|state| (state.number != 0, state.point))
    .unwrap_or((true, last));
  let cleanup = if pressed {
    native::send(
      &app,
      &window,
      &url,
      viewport,
      release_point,
      native::Phase::Up,
      delivery.clone(),
    )
    .await
    .map(|_| ())
  } else {
    Ok(())
  };
  if pressed && cleanup.is_ok() {
    events += 1;
  }
  let cleanup_error = cleanup.err();
  let error = result.err().or_else(|| cleanup_error.clone());
  let mut status = session.status.lock().await;
  status["cleanupError"] = json!(cleanup_error);
  status["phase"] = json!(if error.is_some() {
    "failed"
  } else {
    "complete"
  });
  status["done"] = json!(true);
  status["events"] = json!(events);
  status["error"] = json!(error);
}
