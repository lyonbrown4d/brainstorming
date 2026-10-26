//! Inspection of the actual native menu, available only in the isolated E2E app.
use serde_json::{Value, json};
use tauri::{AppHandle, menu::MenuItemKind};

pub(super) fn snapshot(app: &AppHandle) -> tauri::Result<Value> {
  let Some(menu) = app.menu() else {
    return Ok(json!([]));
  };
  items(menu.items()?)
}

fn items(entries: Vec<MenuItemKind<tauri::DynRuntime>>) -> tauri::Result<Value> {
  entries
    .into_iter()
    .map(|entry| {
      let id = entry.id().as_ref().to_owned();
      let (title, enabled, children) = match entry {
        MenuItemKind::Submenu(item) => (
          item.text()?,
          item.is_enabled()?,
          Some(items(item.items()?)?),
        ),
        MenuItemKind::MenuItem(item) => (item.text()?, item.is_enabled()?, None),
        MenuItemKind::Check(item) => (item.text()?, item.is_enabled()?, None),
        MenuItemKind::Icon(item) => (item.text()?, item.is_enabled()?, None),
        MenuItemKind::Predefined(item) => (item.text()?, true, None),
      };
      let mut value = json!({"id":id,"title":title,"enabled":enabled});
      if let Some(children) = children {
        value["items"] = children;
      }
      Ok(value)
    })
    .collect::<tauri::Result<Vec<_>>>()
    .map(Value::Array)
}
