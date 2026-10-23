use std::{
  path::PathBuf,
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
};
use tauri::webview::PlatformWebview;
use tokio::sync::oneshot;
use webkit2gtk::{SnapshotOptions, SnapshotRegion, prelude::WebViewExt};

pub fn snapshot(
  webview: PlatformWebview,
  output: PathBuf,
  cancelled: Arc<AtomicBool>,
  sender: oneshot::Sender<Result<(), String>>,
) {
  webview.inner().snapshot(
    SnapshotRegion::Visible,
    SnapshotOptions::NONE,
    None::<&webkit2gtk::gio::Cancellable>,
    move |result| {
      // Cairo objects are main-thread-bound. Copy their bounded native pixels;
      // PNG compression and all disk access run on the blocking worker pool.
      let pixels = (|| {
        if cancelled.load(Ordering::Acquire) {
          return Err("网页预览已取消".to_string());
        }
        let surface = result.map_err(|_| "原生网页截图失败")?;
        let mapped = surface.map_to_image(None).map_err(|_| "原生截图无法读取")?;
        let (width, height, stride) = (
          mapped.width() as u32,
          mapped.height() as u32,
          mapped.stride() as usize,
        );
        let format = i32::from(mapped.format());
        if width > 16384
          || height > 16384
          || u64::from(width) * u64::from(height) > 40_000_000
          || ![0, 1].contains(&format)
        {
          return Err("原生截图像素格式无效".into());
        }
        let mut rgba = vec![0; width as usize * height as usize * 4];
        mapped
          .with_data(|data| {
            for y in 0..height as usize {
              for x in 0..width as usize {
                let source = y * stride + x * 4;
                let destination = (y * width as usize + x) * 4;
                let native =
                  u32::from_ne_bytes(data[source..source + 4].try_into().expect("Cairo pixel"));
                let alpha = if format == 1 {
                  255
                } else {
                  (native >> 24) & 255
                };
                let unpremultiply = |value: u32| {
                  if alpha == 0 {
                    0
                  } else {
                    ((value * 255 + alpha / 2) / alpha).min(255) as u8
                  }
                };
                rgba[destination..destination + 4].copy_from_slice(&[
                  unpremultiply((native >> 16) & 255),
                  unpremultiply((native >> 8) & 255),
                  unpremultiply(native & 255),
                  alpha as u8,
                ]);
              }
            }
          })
          .map_err(|_| "原生截图像素不可用")?;
        Ok((width, height, rgba))
      })();
      tauri::async_runtime::spawn_blocking(move || {
        let result = pixels.and_then(|(width, height, rgba)| {
          if cancelled.load(Ordering::Acquire) {
            return Err("网页预览已取消".into());
          }
          image::save_buffer_with_format(
            &output,
            &rgba,
            width,
            height,
            image::ColorType::Rgba8,
            image::ImageFormat::Png,
          )
          .map_err(|_| "无法保存网页截图".to_string())?;
          if cancelled.load(Ordering::Acquire) {
            let _ = std::fs::remove_file(&output);
            return Err("网页预览已取消".into());
          }
          Ok(())
        });
        let _ = sender.send(result);
      });
    },
  );
}
