#[path = "menu_windows.rs"]
mod windows;
use super::MenuContext;
use crate::platform::menu_actions::MenuAction;
use tauri::{
  AppHandle,
  menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
};

pub(super) fn build(
  app: &AppHandle,
  language: &str,
  context: MenuContext,
) -> tauri::Result<Menu<tauri::DynRuntime>> {
  let chinese = language == "zh-CN";
  let text = |zh: &'static str, en: &'static str| if chinese { zh } else { en };
  let active = context.has_document && !context.busy;
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
  let separator = PredefinedMenuItem::separator(app)?;
  let new = action(
    MenuAction::New,
    text("新建导图", "New Document"),
    Some("CmdOrCtrl+N"),
    !context.busy,
  )?;
  let new_window = action(
    MenuAction::NewWindow,
    text("新建窗口", "New Window"),
    None,
    true,
  )?;
  let open = action(
    MenuAction::Open,
    text("打开…", "Open…"),
    Some("CmdOrCtrl+O"),
    !context.busy,
  )?;
  let open_window = action(
    MenuAction::OpenNewWindow,
    text("在新窗口打开…", "Open in New Window…"),
    None,
    true,
  )?;
  let save = action(
    MenuAction::Save,
    text("保存", "Save"),
    Some("CmdOrCtrl+S"),
    active,
  )?;
  let save_as = action(
    MenuAction::SaveAs,
    text("另存为…", "Save As…"),
    Some("CmdOrCtrl+Shift+S"),
    active,
  )?;
  let export = action(
    MenuAction::Export,
    text("导出…", "Export…"),
    Some("CmdOrCtrl+Shift+E"),
    active,
  )?;
  let print = action(
    MenuAction::Print,
    text("打印…", "Print…"),
    Some("CmdOrCtrl+P"),
    active,
  )?;
  let close = action(
    MenuAction::CloseTab,
    text("关闭导图", "Close Document"),
    Some("CmdOrCtrl+W"),
    active,
  )?;
  let file = Submenu::with_items(
    app,
    text("文件", "File"),
    true,
    &[
      &new,
      &new_window,
      &open,
      &open_window,
      &separator,
      &save,
      &save_as,
      &separator,
      &export,
      &print,
      &separator,
      &close,
    ],
  )?;
  let undo = action(
    MenuAction::Undo,
    text("撤销", "Undo"),
    Some("CmdOrCtrl+Z"),
    active,
  )?;
  let redo = action(
    MenuAction::Redo,
    text("重做", "Redo"),
    Some(if cfg!(target_os = "macos") {
      "Cmd+Shift+Z"
    } else {
      "Ctrl+Y"
    }),
    active,
  )?;
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
  let center = action(
    MenuAction::CenterRoot,
    text("前往中心主题", "Go to Central Topic"),
    Some("CmdOrCtrl+R"),
    active,
  )?;
  let actual = action(
    MenuAction::ActualSize,
    text("实际大小", "Actual Size"),
    Some("CmdOrCtrl+0"),
    active,
  )?;
  let zoom_in = action(
    MenuAction::ZoomIn,
    text("放大", "Zoom In"),
    Some("CmdOrCtrl+Plus"),
    active,
  )?;
  let zoom_out = action(
    MenuAction::ZoomOut,
    text("缩小", "Zoom Out"),
    Some("CmdOrCtrl+Minus"),
    active,
  )?;
  let outline = action(
    MenuAction::ToggleOutline,
    text("显示或隐藏大纲", "Toggle Outline"),
    None,
    active,
  )?;
  let properties = action(
    MenuAction::ToggleProperties,
    text("显示或隐藏属性栏", "Toggle Properties"),
    None,
    active,
  )?;
  let minimap = action(
    MenuAction::ToggleMinimap,
    text("显示或隐藏缩略图", "Toggle Minimap"),
    None,
    active,
  )?;
  let two_d = action(
    MenuAction::View2d,
    text("二维视图", "2D View"),
    None,
    active,
  )?;
  let three_d = action(
    MenuAction::View3d,
    text("三维视图", "3D View"),
    None,
    active,
  )?;
  let full_screen = action(
    MenuAction::FullScreen,
    text("切换全屏", "Toggle Full Screen"),
    Some(if cfg!(target_os = "macos") {
      "Ctrl+Cmd+F"
    } else {
      "F11"
    }),
    true,
  )?;
  let view = Submenu::with_items(
    app,
    text("视图", "View"),
    true,
    &[
      &center,
      &actual,
      &zoom_in,
      &zoom_out,
      &separator,
      &outline,
      &properties,
      &minimap,
      &separator,
      &two_d,
      &three_d,
      &full_screen,
    ],
  )?;
  let composer = action(
    MenuAction::Presentation,
    text("编排演示", "Compose Presentation"),
    None,
    active,
  )?;
  let play = action(
    MenuAction::PlayPresentation,
    text("开始播放", "Start Presentation"),
    None,
    active && !context.playing,
  )?;
  let stop = action(
    MenuAction::StopPresentation,
    text("停止播放", "Stop Presentation"),
    None,
    context.playing,
  )?;
  let presentation = Submenu::with_items(
    app,
    text("演示", "Presentation"),
    true,
    &[&composer, &play, &stop],
  )?;
  let window_menu = windows::build(app, chinese, active, &new_window)?;
  let shortcuts = action(
    MenuAction::Shortcuts,
    text("键盘快捷键…", "Keyboard Shortcuts…"),
    None,
    true,
  )?;
  let help = Submenu::with_items(app, text("帮助", "Help"), true, &[&shortcuts])?;
  let settings = action(
    MenuAction::Settings,
    text("设置…", "Settings…"),
    Some("CmdOrCtrl+,"),
    !context.busy,
  )?;
  #[cfg(target_os = "macos")]
  {
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
      &[&about, &settings, &separator, &hide, &quit],
    )?;
    Menu::with_items(
      app,
      &[
        &application,
        &file,
        &edit,
        &view,
        &presentation,
        &window_menu,
        &help,
      ],
    )
  }
  #[cfg(not(target_os = "macos"))]
  {
    help.append(&settings)?;
    Menu::with_items(
      app,
      &[&file, &edit, &view, &presentation, &window_menu, &help],
    )
  }
}
