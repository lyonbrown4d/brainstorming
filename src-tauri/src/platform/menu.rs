#[cfg(target_os = "macos")]
#[path = "menu_build.rs"]
mod build;
use super::menu_actions::MenuActionEvent;
pub use super::menu_actions::MenuContext;
use crate::runtime::AppState;
use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
struct MenuContexts(Mutex<HashMap<String, MenuContext>>);
pub fn install(app: &AppHandle) -> tauri::Result<()> {
  let chinese = app.try_state::<Arc<AppState>>().is_some_and(|state| {
    state
      .language
      .read()
      .is_ok_and(|value| value.as_str() == "zh-CN")
  });
  install_with_language(app, if chinese { "zh-CN" } else { "en" })
}
pub fn install_with_language(app: &AppHandle, language: &str) -> tauri::Result<()> {
  #[cfg(target_os = "macos")]
  {
    let label = crate::runtime::window::focused_label(app).unwrap_or_default();
    let context = app
      .try_state::<MenuContexts>()
      .and_then(|contexts| {
        contexts
          .0
          .lock()
          .ok()
          .and_then(|contexts| contexts.get(&label).copied())
      })
      .unwrap_or_default();
    app.set_menu(build::build(app, language, context)?)?;
  }
  #[cfg(not(target_os = "macos"))]
  let _ = (app, language);
  Ok(())
}
pub fn sync(app: &AppHandle, label: &str, input: serde_json::Value) -> Result<(), String> {
  let context: MenuContext = serde_json::from_value(input).map_err(|_| "菜单状态无效")?;
  let contexts = app.state::<MenuContexts>();
  let mut values = contexts.0.lock().map_err(|_| "菜单状态不可用")?;
  if values.get(label) == Some(&context) {
    return Ok(());
  }
  values.insert(label.into(), context);
  drop(values);
  if crate::runtime::window::focused_label(app).as_deref() == Some(label) {
    install(app).map_err(|_| "无法更新菜单")?;
  }
  Ok(())
}
pub fn register(app: &AppHandle) {
  app.manage(MenuContexts::default());
  #[cfg(desktop)]
  app.on_menu_event(|app, event| dispatch(app, event.id().as_ref()));
}

pub fn dispatch(app: &AppHandle, id: &str) {
  if let Some(label) = id.strip_prefix("focusWindow:") {
    if let Some(window) = app.get_webview_window(label) {
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
    }
    return;
  }
  if let Some(label) = crate::runtime::window::focused_label(app)
    && let Some(action) = MenuActionEvent::from_id(id)
  {
    let _ = app.emit_to(&label, "native:menu-action", action);
  }
}
