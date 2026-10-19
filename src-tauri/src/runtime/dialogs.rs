use super::input::Result;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
#[cfg(not(feature = "e2e"))]
use tauri_plugin_dialog::{FileAccessMode, PickerMode};
use tokio::sync::oneshot;

pub async fn open(app: &AppHandle) -> Result<Option<PathBuf>> {
  #[cfg(feature = "e2e")]
  {
    test_choice(app, "open").await
  }
  #[cfg(not(feature = "e2e"))]
  {
    let (send, receive) = oneshot::channel();
    app
      .dialog()
      .file()
      .add_filter("Brainstorming / XMind", &["brainstorming", "xmind"])
      .set_picker_mode(PickerMode::Document)
      .set_file_access_mode(FileAccessMode::Scoped)
      .pick_file(move |file| {
        let _ = send.send(file);
      });
    match receive.await.map_err(|_| "文件对话框已关闭")? {
      Some(path) => super::native_files::stage(app, path).await.map(Some),
      None => Ok(None),
    }
  }
}
pub async fn save(app: &AppHandle, suggested: &str, format: &str) -> Result<Option<PathBuf>> {
  #[cfg(feature = "e2e")]
  {
    let _ = (suggested, format);
    test_choice(app, "save").await
  }
  #[cfg(not(feature = "e2e"))]
  {
    let (send, receive) = oneshot::channel();
    let name = super::input::safe_name(suggested);
    let name = if name.to_lowercase().ends_with(&format!(".{format}")) {
      name
    } else {
      format!("{name}.{format}")
    };
    app
      .dialog()
      .file()
      .set_file_name(&name)
      .add_filter(format.to_uppercase(), &[format])
      .save_file(move |file| {
        let _ = send.send(file);
      });
    match receive.await.map_err(|_| "文件对话框已关闭")? {
      Some(path) => super::native_files::destination(app, path, &name)
        .await
        .map(Some),
      None => Ok(None),
    }
  }
}
pub async fn confirm_discard(app: &AppHandle) -> Result<bool> {
  use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind, MessageDialogResult};
  let (send, receive) = oneshot::channel();
  let chinese = app
    .try_state::<std::sync::Arc<super::AppState>>()
    .and_then(|s| s.language.read().ok().map(|v| *v == "zh-CN"))
    .unwrap_or(false);
  app
    .dialog()
    .message(if chinese {
      "存在未保存的修改。关闭后将无法恢复这些修改。"
    } else {
      "Some open maps have unsaved changes. Closing discards all unsaved changes."
    })
    .title(if chinese {
      "关闭 Brainstorming？"
    } else {
      "Close Brainstorming?"
    })
    .kind(MessageDialogKind::Warning)
    .buttons(MessageDialogButtons::YesNoCancelCustom(
      if chinese {
        "返回编辑"
      } else {
        "Return to editing"
      }
      .into(),
      if chinese {
        "丢弃并关闭"
      } else {
        "Discard and close"
      }
      .into(),
      if chinese { "取消" } else { "Cancel" }.into(),
    ))
    .show_with_result(move |result| {
      let discard = match result {
        MessageDialogResult::No => true,
        MessageDialogResult::Custom(label) => {
          label
            == if chinese {
              "丢弃并关闭"
            } else {
              "Discard and close"
            }
        }
        _ => false,
      };
      let _ = send.send(discard);
    });
  receive.await.map_err(|_| "确认对话框已关闭".into())
}
pub fn local_path(path: FilePath) -> Result<PathBuf> {
  path
    .into_path()
    .map_err(|_| "文件地址无法转换为本机路径".into())
}

pub async fn pick(app: &AppHandle, kind: &str, extensions: &[&str]) -> Result<Option<PathBuf>> {
  #[cfg(feature = "e2e")]
  {
    let _ = (kind, extensions);
    test_choice(app, "asset").await
  }
  #[cfg(not(feature = "e2e"))]
  {
    let (send, receive) = oneshot::channel();
    app
      .dialog()
      .file()
      .add_filter(kind, extensions)
      .pick_file(move |file| {
        let _ = send.send(file);
      });
    match receive.await.map_err(|_| "文件对话框已关闭")? {
      Some(path) => super::native_files::stage(app, path).await.map(Some),
      None => Ok(None),
    }
  }
}

#[cfg(feature = "e2e")]
async fn test_choice(app: &AppHandle, kind: &str) -> Result<Option<PathBuf>> {
  let state = app
    .try_state::<std::sync::Arc<super::AppState>>()
    .ok_or("E2E picker state is unavailable")?;
  let mut choices = state.test_dialogs.lock().await;
  match choices.front() {
    Some((expected, _)) if expected == kind => Ok(choices.pop_front().and_then(|(_, path)| path)),
    Some((expected, _)) => Err(format!(
      "E2E picker mismatch: expected {expected}, received {kind}"
    )),
    None => Err(format!("E2E picker fixture missing for {kind}")),
  }
}
