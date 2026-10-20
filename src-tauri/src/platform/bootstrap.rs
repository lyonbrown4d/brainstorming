use crate::{
  media::MediaState,
  runtime::{self, AppState},
};
use std::{path::PathBuf, sync::Arc};
use tauri::{Manager, RunEvent};

pub fn run() {
  let builder =
    super::plugins::register(tauri::Builder::default()).on_permission_request(|webview, kind| {
      use tauri::webview::{PermissionKind, PermissionResponse};
      if webview.label() != "main"
        || !webview
          .url()
          .is_ok_and(|url| super::request::trusted_url(&url, webview.app_handle()))
      {
        return PermissionResponse::Deny;
      }
      match kind {
        PermissionKind::Microphone => PermissionResponse::Default,
        _ => PermissionResponse::Deny,
      }
    });
  let builder = builder.invoke_handler(crate::bindings::builder().invoke_handler());
  let app = builder
    .setup(|app| {
      super::menu::register(app.handle());
      #[cfg(desktop)]
      tauri::WebviewWindowBuilder::new(app, "splash", tauri::WebviewUrl::App("splash.html".into()))
        .title("Brainstorming")
        .inner_size(520.0, 360.0)
        .center()
        .resizable(false)
        .decorations(false)
        .visible(true)
        .build()?;
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        if super::initialization::ready(&handle).await.is_err() {
          tracing::error!("Native initialization failed");
          super::initialization::set_phase(&handle, "failed");
        }
      });
      #[cfg(desktop)]
      {
        let handle = app.handle().clone();
        let paths: Vec<PathBuf> = std::env::args_os()
          .skip(1)
          .map(PathBuf::from)
          .filter(|p| p.is_absolute())
          .take(32)
          .collect();
        tauri::async_runtime::spawn(async move {
          if super::initialization::ready(&handle).await.is_ok() {
            for path in paths {
              runtime::enqueue_open(&handle, path).await;
            }
          }
        });
      }
      Ok(())
    })
    .on_page_load(|webview, payload| {
      if webview.label() == "main"
        && matches!(payload.event(), tauri::webview::PageLoadEvent::Started)
      {
        let app = webview.app_handle().clone();
        tauri::async_runtime::spawn(async move {
          runtime::renderer_started(&app).await;
        });
      }
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event
        && window.label() == "main"
        && let Some(media) = window.app_handle().try_state::<Arc<MediaState>>()
      {
        media.grant_paths(paths.clone());
      }
      runtime::handle_window_event(window, event);
      if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
        if let Some(media) = window.app_handle().try_state::<Arc<MediaState>>() {
          media.revoke();
        }
        if let Some(splash) = window.app_handle().get_webview_window("splash") {
          let _ = splash.destroy();
        }
        super::initialization::exit(window.app_handle(), 0);
      }
    })
    .build(tauri::generate_context!())
    .expect("Brainstorming 原生应用初始化失败");
  app.run(|app, event| match event {
    #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
    RunEvent::Opened { urls } => {
      let app = app.clone();
      tauri::async_runtime::spawn(async move {
        if super::initialization::ready(&app).await.is_err() {
          return;
        }
        for url in urls.into_iter().take(32) {
          if let Ok(path) =
            runtime::native_files::stage(&app, tauri_plugin_dialog::FilePath::Url(url)).await
          {
            runtime::enqueue_open(&app, path).await;
          }
        }
      });
    }
    RunEvent::ExitRequested { api, code, .. } => {
      if super::initialization::exit_ready(app) {
        return;
      }
      api.prevent_exit();
      let state = app.try_state::<Arc<AppState>>();
      let confirmed = state
        .as_ref()
        .is_some_and(|state| state.session.try_lock().is_ok_and(|s| s.close_allowed));
      if state.is_none() || confirmed || app.get_webview_window("main").is_none() {
        super::initialization::exit(app, code.unwrap_or(0));
      } else if let Some(main) = app.get_webview_window("main") {
        let _ = main.close();
      }
    }
    RunEvent::Exit => {
      if let Some(media) = app.try_state::<Arc<MediaState>>() {
        media.revoke();
      }
    }
    _ => (),
  });
}
