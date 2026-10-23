use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MenuAction {
  New,
  NewWindow,
  Open,
  OpenNewWindow,
  Save,
  SaveAs,
  CloseTab,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  ActualSize,
  CenterRoot,
  MoveTabNewWindow,
  MoveTabWindow,
  Settings,
  Shortcuts,
  ToggleOutline,
  ToggleProperties,
  ToggleMinimap,
  View2d,
  View3d,
  FullScreen,
  Presentation,
  PlayPresentation,
  StopPresentation,
  Export,
  Print,
}
#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MenuActionEvent {
  pub action: MenuAction,
  pub window_id: Option<String>,
}
impl MenuActionEvent {
  /// Menu IDs are Tauri integration details; IPC carries a typed action and target.
  pub fn from_id(id: &str) -> Option<Self> {
    if let Some(target) = id.strip_prefix("moveTabWindow:") {
      return Some(Self {
        action: MenuAction::MoveTabWindow,
        window_id: Some(target.into()),
      });
    }
    serde_json::from_value(serde_json::Value::String(id.into()))
      .ok()
      .map(|action| Self {
        action,
        window_id: None,
      })
  }
}
#[derive(Clone, Copy, Default, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MenuContext {
  pub has_document: bool,
  pub busy: bool,
  pub playing: bool,
}
