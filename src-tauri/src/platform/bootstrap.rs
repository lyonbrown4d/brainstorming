use crate::{
  media::MediaState,
  runtime::{self, AppState},
};
use std::{path::PathBuf, sync::Arc};
use tauri::{Manager, RunEvent};

pub fn run() {
  let context = tauri::generate_context!();
  #[cfg(desktop)]
  let runtime = super::cef_runtime::attributes(&context.config().identifier);
  #[cfg(mobile)]
  let runtime = tauri_runtime_wry::Wry::default();
  let builder = super::plugins::register(tauri::Builder::default().runtime(runtime))
    .on_permission_request(|webview, kind| {
      use tauri::webview::{PermissionKind, PermissionResponse};
      if webview.label() != "main" && !webview.label().starts_with("editor-") {
        return PermissionResponse::Deny;
      }
      // Desktop navigation is restricted by cef-policy. Reading URL here would
      // deadlock CEF's permission UI thread; microphone still requires its picker.
      #[cfg(mobile)]
      if !webview
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
      // CEF initially reports about:blank during setup. Initialize after a real
      // main document commits; the renderer's first native request may start sooner.
      if webview.label() == "main"
        && matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
      {
        let handle = webview.app_handle().clone();
        tauri::async_runtime::spawn(async move {
          if super::initialization::ready(&handle).await.is_err() {
            tracing::error!("Native initialization failed");
            super::initialization::set_phase(&handle, "failed");
          }
        });
      }
      if (webview.label() == "main" || webview.label().starts_with("editor-"))
        && matches!(payload.event(), tauri::webview::PageLoadEvent::Started)
      {
        let app = webview.app_handle().clone();
        let label = webview.label().to_string();
        tauri::async_runtime::spawn(async move {
          runtime::renderer_started(&app, &label).await;
        });
      }
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event
        && (window.label() == "main" || window.label().starts_with("editor-"))
        && let Some(media) = window.app_handle().try_state::<Arc<MediaState>>()
      {
        let app = window.app_handle().clone();
        let label = window.label().to_string();
        let paths = paths.clone();
        let media = media.inner().clone();
        tauri::async_runtime::spawn(async move {
          if let Some(state) = app.try_state::<Arc<AppState>>()
            && let Ok(state) = state.for_window(&label).await
            && let Ok(media) = media.for_window(state).await
          {
            media.grant_paths(paths);
          }
        });
      }
      runtime::handle_window_event(window, event);
      if (window.label() == "main" || window.label().starts_with("editor-"))
        && matches!(event, tauri::WindowEvent::Destroyed)
      {
        let app = window.app_handle().clone();
        let label = window.label().to_string();
        tauri::async_runtime::spawn(async move {
          runtime::window_lifecycle::destroyed(&app, &label).await;
        });
      }
    })
    .build(context)
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
      if code.is_some() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
          runtime::window_lifecycle::quit(&app, code.unwrap_or(0)).await;
        });
      } else if app
        .webview_windows()
        .values()
        .all(|window| window.label() == "splash")
      {
        super::initialization::exit(app, 0);
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
