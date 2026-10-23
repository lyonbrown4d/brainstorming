use crate::platform::compute::*;
use crate::platform::export_capture::*;
use crate::platform::export_commands::*;
use crate::platform::window_commands::*;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands};

pub(crate) fn builder() -> Builder<tauri::Wry> {
  macro_rules! commands {
    ($($extra:ident),*) => { collect_commands![crate::platform::wire::native_request, editor_open, editor_execute, editor_close, compute_layout, compute_spatial_layout, compute_find, compute_render, compute_export, compute_import_text, compute_previews, document_export_prepare, document_export_presentation, document_export_start, document_export_cancel, document_export_reveal, document_export_capture, document_export_preview, focus_editor_window, $(crate::platform::wire::$extra),*] };
  }
  #[cfg(not(feature = "e2e"))]
  let commands = commands![];
  #[cfg(feature = "e2e")]
  let commands = commands![e2e_fixture];
  Builder::new()
    .typ::<crate::platform::menu_actions::MenuActionEvent>()
    .typ::<crate::platform::menu_actions::MenuContext>()
    .typ::<crate::document_exports::Request>()
    .typ::<crate::document_exports::Progress>()
    .error_handling(ErrorHandlingMode::Throw)
    .commands(commands)
}
/// Deterministic developer/build output, intentionally absent from Git.
pub fn export(path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  let temporary = path.with_extension(format!("{}.tmp.ts", std::process::id()));
  let result = builder().export(specta_typescript::Typescript::default(), &temporary);
  if let Err(error) = result {
    let _ = std::fs::remove_file(&temporary);
    return Err(error.into());
  }
  // Concurrent Moon tasks see either complete version, never a partially written module.
  if std::fs::read(path).ok() == std::fs::read(&temporary).ok() {
    std::fs::remove_file(temporary)?;
  } else {
    std::fs::rename(temporary, path)?;
  }
  Ok(())
}
