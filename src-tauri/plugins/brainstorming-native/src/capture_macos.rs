use block2::RcBlock;
use objc2_app_kit::NSImage;
use objc2_foundation::NSError;
use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::webview::PlatformWebview;
use tokio::sync::oneshot;

pub fn snapshot(
    webview: PlatformWebview,
    output: PathBuf,
    cancelled: Arc<AtomicBool>,
    sender: oneshot::Sender<Result<(), String>>,
) {
    let sender = Arc::new(Mutex::new(Some(sender)));
    let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        let bytes = (|| {
            if cancelled.load(Ordering::Acquire) {
                return Err("网页预览已取消".to_string());
            }
            if !error.is_null() || image.is_null() {
                return Err("原生网页截图失败".into());
            }
            // SAFETY: WebKit retains the image for this main-thread completion block.
            let image = unsafe { &*image };
            Ok(image.TIFFRepresentation().ok_or("原生截图为空")?.to_vec())
        })();
        match bytes {
            Ok(bytes) => {
                let output = output.clone();
                let cancelled = cancelled.clone();
                let sender = sender.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let result = (|| {
                        if cancelled.load(Ordering::Acquire) {
                            return Err("网页预览已取消".into());
                        }
                        image::load_from_memory_with_format(&bytes, image::ImageFormat::Tiff)
                            .map_err(|_| "原生截图无法解码")?
                            .save_with_format(&output, image::ImageFormat::Png)
                            .map_err(|_| "无法保存网页截图".to_string())?;
                        if cancelled.load(Ordering::Acquire) {
                            let _ = std::fs::remove_file(&output);
                            return Err("网页预览已取消".into());
                        }
                        Ok(())
                    })();
                    if let Ok(mut sender) = sender.lock() {
                        if let Some(sender) = sender.take() {
                            let _ = sender.send(result);
                        }
                    }
                });
            }
            Err(error) => {
                if let Ok(mut sender) = sender.lock() {
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(Err(error));
                    }
                }
            }
        }
    });
    // SAFETY: with_webview dispatches on AppKit's main thread; the live WKWebView
    // is owned by the capture window and WebKit copies its completion block.
    unsafe {
        let webview = &*(webview.inner() as *mut WKWebView);
        let marker = objc2::MainThreadMarker::new().expect("native snapshot main thread");
        let config = WKSnapshotConfiguration::new(marker);
        webview.takeSnapshotWithConfiguration_completionHandler(Some(&config), &callback);
    }
}
