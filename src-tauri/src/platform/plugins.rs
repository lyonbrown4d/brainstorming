#[cfg(desktop)]
use crate::runtime;
#[cfg(desktop)]
use std::path::PathBuf;
use tauri::Manager;

pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
  let builder = builder
    .manage(super::initialization::Initialization::default())
    .manage(WindowStateRestore::default());
  // Tauri requires this plugin first so secondary launches exit before setup.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _| {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
      if super::initialization::ready(&app).await.is_err() {
        return;
      }
      for argument in args.into_iter().skip(1).take(32) {
        let path = PathBuf::from(argument);
        if path.is_absolute() {
          runtime::enqueue_open(&app, path).await;
        }
      }
      // Initial visibility belongs to the renderer's startupReady handoff.
      if let Some(main) =
        crate::runtime::window::focused_label(&app).and_then(|label| app.get_webview_window(&label))
        && main.is_visible().unwrap_or(false)
      {
        let _ = main.unminimize();
        let _ = main.set_focus();
      }
    });
  }));
  let builder = builder
    .plugin(super::logging::plugin())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_brainstorming_native::init());
  #[cfg(all(desktop, not(feature = "e2e")))]
  let builder = builder.plugin(
    tauri_plugin_window_state::Builder::new()
      .with_state_flags(geometry_state_flags())
      .with_filter(|label| label == "main")
      .build(),
  );
  #[cfg(target_os = "macos")]
  let builder = builder.plugin(tauri_plugin_macos_fps::init());
  #[cfg(feature = "e2e")]
  let builder = builder
    .plugin(tauri_plugin_wdio::init())
    .plugin(tauri_plugin_wdio_webdriver::init());
  builder
}

#[cfg(all(desktop, any(test, not(feature = "e2e"))))]
fn geometry_state_flags() -> tauri_plugin_window_state::StateFlags {
  use tauri_plugin_window_state::StateFlags;
  StateFlags::SIZE | StateFlags::POSITION
}

#[cfg(all(desktop, any(test, not(feature = "e2e"))))]
fn saved_state_flags() -> tauri_plugin_window_state::StateFlags {
  geometry_state_flags() | tauri_plugin_window_state::StateFlags::MAXIMIZED
}

#[derive(Default)]
pub struct WindowStateRestore(std::sync::atomic::AtomicBool);

impl WindowStateRestore {
  fn claim(&self, label: &str) -> bool {
    label == "main" && !self.0.swap(true, std::sync::atomic::Ordering::AcqRel)
  }
}

pub fn restore_window_state(window: &tauri::WebviewWindow) {
  let claimed = window.state::<WindowStateRestore>().claim(window.label());
  #[cfg(all(desktop, not(feature = "e2e")))]
  if claimed {
    use tauri_plugin_window_state::WindowExt;
    // Geometry was restored before tracking began; maximize is deferred until
    // startupReady because it may show a hidden window on some platforms.
    if window
      .restore_state(tauri_plugin_window_state::StateFlags::MAXIMIZED)
      .is_err()
    {
      tracing::warn!("Main window maximized state restore failed; using defaults");
    }
  }
  #[cfg(not(all(desktop, not(feature = "e2e"))))]
  let _ = claimed;
}

pub async fn save_window_state(window: &tauri::WebviewWindow) {
  #[cfg(all(desktop, not(feature = "e2e")))]
  {
    use std::sync::atomic::Ordering;
    use tauri_plugin_window_state::AppHandleExt;
    if window.label() != "main"
      || !window
        .state::<WindowStateRestore>()
        .0
        .load(Ordering::Acquire)
    {
      return;
    }
    let app = window.app_handle().clone();
    let saved =
      tauri::async_runtime::spawn_blocking(move || app.save_window_state(saved_state_flags()))
        .await;
    if !matches!(saved, Ok(Ok(()))) {
      tracing::warn!("Main window state save failed");
    }
  }
  #[cfg(not(all(desktop, not(feature = "e2e"))))]
  let _ = window;
}

#[cfg(all(test, desktop))]
mod tests {
  use super::{WindowStateRestore, geometry_state_flags, saved_state_flags};
  use tauri_plugin_window_state::StateFlags;

  #[test]
  fn geometry_is_restored_once_at_the_main_window_handoff() {
    let restore = WindowStateRestore::default();
    assert!(!restore.claim("splash"));
    assert!(restore.claim("main"));
    assert!(!restore.claim("main"));
  }

  #[test]
  fn window_restore_preserves_startup_visibility_and_custom_chrome() {
    let flags = geometry_state_flags();
    assert!(flags.contains(StateFlags::SIZE | StateFlags::POSITION));
    assert_eq!(
      saved_state_flags().bits(),
      flags.bits() | StateFlags::MAXIMIZED.bits()
    );
    assert!(!flags.intersects(
      StateFlags::MAXIMIZED
        | StateFlags::VISIBLE
        | StateFlags::FULLSCREEN
        | StateFlags::DECORATIONS
    ));
  }
}
