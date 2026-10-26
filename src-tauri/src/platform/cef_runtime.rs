use tauri::{Manager, Webview};
use tauri_runtime_cef::{
  WebviewCefExt,
  cef::{
    CefString, ContentSettingTypes, ContentSettingValues, ImplBrowser, ImplBrowserHost,
    ImplRequestContext,
  },
};

fn editor(label: &str) -> bool {
  label == "main" || label.starts_with("editor-")
}

/// CEF callbacks must never synchronously dispatch back through Tauri's event loop.
pub(super) fn plugin() -> tauri::plugin::TauriPlugin<tauri::DynRuntime> {
  tauri::plugin::Builder::new("cef-policy")
    .on_navigation(|view, url| {
      (!editor(view.label()) && view.label() != "splash")
        || super::request::trusted_url(url, view.app_handle())
    })
    .on_webview_ready(prepare_loopback)
    .build()
}

fn prepare_loopback(view: Webview) {
  if !editor(view.label()) {
    return;
  }
  let mut origins = vec![
    "http://tauri.localhost".to_owned(),
    "https://tauri.localhost".to_owned(),
  ];
  if cfg!(debug_assertions)
    && let Some(dev) = &view.app_handle().config().build.dev_url
  {
    origins.push(dev.origin().ascii_serialization());
  }
  // Only the app origin embedded in itself may reach the native loopback resource
  // server. Remote previews retain their own request context and no such grant.
  if view
    .with_cef_webview(move |native| {
      if let Some(context) = native
        .browser()
        .host()
        .and_then(|host| host.request_context())
      {
        for origin in origins {
          let origin = CefString::from(origin.as_str());
          context.set_content_setting(
            Some(&origin),
            Some(&origin),
            ContentSettingTypes::LOOPBACK_NETWORK,
            ContentSettingValues::ALLOW,
          );
        }
      }
    })
    .is_err()
  {
    tracing::error!("CEF resource permission setup failed");
  }
}

pub(super) fn attributes(identifier: &str) -> tauri_runtime_cef::Cef {
  let runtime = tauri_runtime_cef::Cef::default();
  #[cfg(feature = "e2e")]
  if identifier == "app.brainstorming.e2e"
    && let Ok(port) = std::env::var("BRAINSTORMING_CEF_DEBUG_PORT")
  {
    let port = port.parse::<u16>().expect("Invalid CEF E2E debug port");
    assert!(port >= 1024, "CEF E2E debug port must be unprivileged");
    let cache = std::path::PathBuf::from(
      std::env::var_os("BRAINSTORMING_CEF_CACHE").expect("Missing isolated CEF E2E cache"),
    );
    assert!(cache.is_absolute(), "CEF E2E cache must be absolute");
    // The isolated browser cache holds no user credentials. Avoid opening the
    // host keyring's unlock dialog on a private test D-Bus session.
    #[cfg(target_os = "linux")]
    let runtime = runtime.command_line_arg("password-store", Some("basic"));
    return runtime.root_cache_path(cache).remote_debugging(
      tauri_runtime_cef::RemoteDebugging::Port {
        port,
        allowed_origins: Vec::new(),
      },
    );
  }
  let _ = identifier;
  runtime
}
