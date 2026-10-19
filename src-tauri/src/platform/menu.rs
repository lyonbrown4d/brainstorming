use crate::runtime::AppState;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

pub fn install(app: &AppHandle) -> tauri::Result<()> {
  let chinese = app
    .try_state::<Arc<AppState>>()
    .is_some_and(|state| state.language.read().is_ok_and(|v| v.as_str() == "zh-CN"));
  install_with_language(app, if chinese { "zh-CN" } else { "en" })
}
pub fn install_with_language(app: &AppHandle, language: &str) -> tauri::Result<()> {
  #[cfg(desktop)]
  {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
    let chinese = language == "zh-CN";
    let text = |zh: &'static str, en: &'static str| if chinese { zh } else { en };
    let action = |id: &str, title: &str, accelerator: &str| {
      MenuItem::with_id(app, id, title, true, Some(accelerator))
    };
    let new = action("new", text("新建", "New"), "CmdOrCtrl+N")?;
    let open = action("open", text("打开…", "Open…"), "CmdOrCtrl+O")?;
    let save = action("save", text("保存", "Save"), "CmdOrCtrl+S")?;
    let save_as = action("saveAs", text("另存为…", "Save As…"), "CmdOrCtrl+Shift+S")?;
    let close = action(
      "closeTab",
      text("关闭导图", "Close Document"),
      "CmdOrCtrl+W",
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let file = Submenu::with_items(
      app,
      text("文件", "File"),
      true,
      &[&new, &open, &save, &save_as, &separator, &close],
    )?;
    let undo = action("undo", text("撤销", "Undo"), "CmdOrCtrl+Z")?;
    let redo = action("redo", text("重做", "Redo"), "CmdOrCtrl+Shift+Z")?;
    let cut = PredefinedMenuItem::cut(app, Some(text("剪切", "Cut")))?;
    let copy = PredefinedMenuItem::copy(app, Some(text("复制", "Copy")))?;
    let paste = PredefinedMenuItem::paste(app, Some(text("粘贴", "Paste")))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(text("全选", "Select All")))?;
    let edit = Submenu::with_items(
      app,
      text("编辑", "Edit"),
      true,
      &[&undo, &redo, &separator, &cut, &copy, &paste, &select_all],
    )?;
    let center = action("centerRoot", text("居中", "Center"), "CmdOrCtrl+0")?;
    let zoom_in = action("zoomIn", text("放大", "Zoom In"), "CmdOrCtrl+Plus")?;
    let zoom_out = action("zoomOut", text("缩小", "Zoom Out"), "CmdOrCtrl+Minus")?;
    let view = Submenu::with_items(
      app,
      text("视图", "View"),
      true,
      &[&center, &zoom_in, &zoom_out],
    )?;
    #[cfg(target_os = "macos")]
    let menu = {
      let about = PredefinedMenuItem::about(
        app,
        Some(text("关于 Brainstorming", "About Brainstorming")),
        None,
      )?;
      let hide = PredefinedMenuItem::hide(app, None)?;
      let quit = PredefinedMenuItem::quit(app, None)?;
      let application = Submenu::with_items(
        app,
        "Brainstorming",
        true,
        &[&about, &separator, &hide, &quit],
      )?;
      Menu::with_items(app, &[&application, &file, &edit, &view])?
    };
    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(app, &[&file, &edit, &view])?;
    app.set_menu(menu)?;
  }
  #[cfg(mobile)]
  let _ = (app, language);
  Ok(())
}

pub fn register(app: &AppHandle) {
  #[cfg(desktop)]
  app.on_menu_event(|app, event| {
    let id = event.id().as_ref();
    if [
      "new",
      "open",
      "save",
      "saveAs",
      "closeTab",
      "undo",
      "redo",
      "centerRoot",
      "zoomIn",
      "zoomOut",
    ]
    .contains(&id)
    {
      let _ = app.emit_to("main", "native:menu-action", id);
    }
  });
  #[cfg(mobile)]
  let _ = app;
}
