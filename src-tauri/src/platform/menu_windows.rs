use crate::platform::menu_actions::MenuAction;
use tauri::{
  AppHandle, Manager,
  menu::{MenuItem, Submenu},
};

pub(super) fn build(
  app: &AppHandle,
  chinese: bool,
  active: bool,
  new_window: &MenuItem<tauri::DynRuntime>,
) -> tauri::Result<Submenu<tauri::DynRuntime>> {
  let text = |zh: &'static str, en: &'static str| if chinese { zh } else { en };
  let action = |id: MenuAction, title: &str, key: Option<&str>, enabled: bool| {
    let id = serde_json::to_value(id).expect("menu action is serializable");
    MenuItem::with_id(
      app,
      id.as_str().expect("menu action is a string"),
      title,
      enabled,
      key,
    )
  };
  let move_new = action(
    MenuAction::MoveTabNewWindow,
    text("将当前导图移到新窗口", "Move Document to New Window"),
    None,
    active,
  )?;
  let window_menu =
    Submenu::with_items(app, text("窗口", "Window"), true, &[new_window, &move_new])?;
  let focused = crate::runtime::window::focused_label(app);
  for window in app
    .webview_windows()
    .values()
    .filter(|window| window.label() == "main" || window.label().starts_with("editor-"))
  {
    let title = window.title().unwrap_or_else(|_| "Brainstorming".into());
    let focus = MenuItem::with_id(
      app,
      format!("focusWindow:{}", window.label()),
      &title,
      true,
      None::<&str>,
    )?;
    window_menu.append(&focus)?;
    if Some(window.label()) != focused.as_deref() {
      let move_to = MenuItem::with_id(
        app,
        format!("moveTabWindow:{}", window.label()),
        format!("{} {title}", text("将导图移到", "Move Document to")),
        active,
        None::<&str>,
      )?;
      window_menu.append(&move_to)?;
    }
  }
  Ok(window_menu)
}
