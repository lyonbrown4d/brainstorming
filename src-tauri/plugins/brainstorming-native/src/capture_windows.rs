use std::{
  path::PathBuf,
  sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
  },
};
use tauri::webview::PlatformWebview;
use tokio::sync::oneshot;
use webview2_com::{
  CapturePreviewCompletedHandler,
  Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
};
use windows::{
  Win32::{
    Storage::FileSystem::FILE_ATTRIBUTE_NORMAL,
    System::Com::{STGC_DEFAULT, STGM_CREATE, STGM_READWRITE, STGM_SHARE_EXCLUSIVE},
    UI::Shell::SHCreateStreamOnFileEx,
  },
  core::HSTRING,
};

pub fn snapshot(
  webview: PlatformWebview,
  output: PathBuf,
  cancelled: Arc<AtomicBool>,
  sender: oneshot::Sender<Result<(), String>>,
) {
  let sender = Arc::new(Mutex::new(Some(sender)));
  let run = || -> windows::core::Result<()> {
    // SAFETY: the native capture callback runs on WebView2's STA thread. This
    // dedicated file stream belongs only to this snapshot and is never shared.
    let stream = unsafe {
      SHCreateStreamOnFileEx(
        &HSTRING::from(output.to_string_lossy().as_ref()),
        STGM_CREATE | STGM_READWRITE | STGM_SHARE_EXCLUSIVE,
        FILE_ATTRIBUTE_NORMAL.0,
        true,
        None,
      )?
    };
    let completed_stream = stream.clone();
    let callback_sender = sender.clone();
    let handler = CapturePreviewCompletedHandler::create(Box::new(move |status| {
      let result = if cancelled.load(Ordering::Acquire) {
        Err("网页预览已取消".into())
      } else {
        status
          .ok()
          .and_then(|_| unsafe { completed_stream.Commit(STGC_DEFAULT) })
          .map_err(|_| "原生网页截图失败".to_string())
      };
      if let Ok(mut sender) = callback_sender.lock() {
        if let Some(sender) = sender.take() {
          let _ = sender.send(result);
        }
      }
      Ok(())
    }));
    unsafe {
      webview.controller().CoreWebView2()?.CapturePreview(
        COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
        &stream,
        &handler,
      )?;
    }
    Ok(())
  };
  if run().is_err() {
    if let Ok(mut sender) = sender.lock() {
      if let Some(sender) = sender.take() {
        let _ = sender.send(Err("无法启动原生截图".into()));
      }
    }
  }
}
