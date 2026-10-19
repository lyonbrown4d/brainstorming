use objc2_app_kit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility};
use objc2_foundation::NSRect;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::oneshot;

type Result<T> = std::result::Result<T, String>;

/// Rust-only diagnostics. All AppKit access runs on its main thread; this never
/// changes frames, titlebar configuration, button visibility, or window state.
pub async fn metrics<R: Runtime>(app: &AppHandle<R>) -> Result<Value> {
    let app_on_main = app.clone();
    let (send, receive) = oneshot::channel();
    app.run_on_main_thread(move || {
        let result = (|| {
            let window = app_on_main
                .get_webview_window("main")
                .ok_or("应用窗口不可用")?;
            let pointer = window.ns_window().map_err(|_| "无法读取原生窗口")?;
            if pointer.is_null() {
                return Err("原生窗口不可用".into());
            }
            // SAFETY: Tauri owns the live NSWindow, and this closure holds its
            // WebviewWindow on AppKit's main thread without yielding or mutating it.
            let native = unsafe { &*pointer.cast::<NSWindow>() };
            read(native)
        })();
        let _ = send.send(result);
    })
    .map_err(|_| "无法调度原生窗口测量")?;
    receive.await.map_err(|_| "原生窗口测量未返回".to_owned())?
}

fn read(window: &NSWindow) -> Result<Value> {
    let content = window.contentView().ok_or("原生内容视图不可用")?;
    let bounds = content.bounds();
    let frame = window.frame();
    let style = window.styleMask();
    let layout = content.convertRect_fromView(window.contentLayoutRect(), None);
    let metrics = json!({
        "coordinateSystem": "content-top-left-points",
        "window": {
            "width": frame.size.width,
            "height": frame.size.height,
            "visible": window.isVisible(),
            "miniaturized": window.isMiniaturized(),
            "backingScaleFactor": window.backingScaleFactor(),
            "styleMask": style.bits(),
            "titled": style.contains(NSWindowStyleMask::Titled),
            "fullSizeContentView": style.contains(NSWindowStyleMask::FullSizeContentView),
            "titleHidden": window.titleVisibility() == NSWindowTitleVisibility::Hidden,
            "titlebarTransparent": window.titlebarAppearsTransparent()
        },
        "contentView": {
            "width": bounds.size.width,
            "height": bounds.size.height,
            "flipped": content.isFlipped()
        },
        "contentLayout": rectangle(layout, bounds, content.isFlipped()),
        "buttons": {
            "close": button(window, &content, NSWindowButton::CloseButton),
            "minimize": button(window, &content, NSWindowButton::MiniaturizeButton),
            "zoom": button(window, &content, NSWindowButton::ZoomButton)
        }
    });
    #[cfg(feature = "e2e")]
    let metrics = {
        let mut metrics = metrics;
        metrics["focusDiagnostics"] = focus_diagnostics(window);
        metrics
    };
    Ok(metrics)
}

/// Read only after `metrics` has dispatched to AppKit's main thread.
#[cfg(feature = "e2e")]
fn focus_diagnostics(window: &NSWindow) -> Value {
    use objc2_app_kit::NSApplication;
    use objc2_foundation::MainThreadMarker;
    let marker = MainThreadMarker::new().expect("window metrics require the AppKit main thread");
    let app = NSApplication::sharedApplication(marker);
    json!({
        "application": {
            "active": app.isActive(),
            "hidden": app.isHidden(),
            "activationPolicy": app.activationPolicy().0,
            "keyWindowNumber": app.keyWindow().map(|value| value.windowNumber()),
            "mainWindowNumber": app.mainWindow().map(|value| value.windowNumber())
        },
        "main": {
            "windowNumber": window.windowNumber(),
            "key": window.isKeyWindow(),
            "main": window.isMainWindow(),
            "canBecomeKey": window.canBecomeKeyWindow(),
            "canBecomeMain": window.canBecomeMainWindow(),
            "visible": window.isVisible(),
            "miniaturized": window.isMiniaturized(),
            "occlusionState": window.occlusionState().bits(),
            "onActiveSpace": window.isOnActiveSpace()
        }
    })
}

fn button(window: &NSWindow, content: &NSView, kind: NSWindowButton) -> Value {
    let Some(button) = window.standardWindowButton(kind) else {
        return Value::Null;
    };
    let rect = content.convertRect_fromView(button.bounds(), Some(&button));
    let hidden = button.isHiddenOrHasHiddenAncestor();
    let mut metrics = rectangle(rect, content.bounds(), content.isFlipped());
    metrics["visible"] = json!(
        window.isVisible()
            && !window.isMiniaturized()
            && window.alphaValue() > 0.0
            && !hidden
            && button.alphaValue() > 0.0
            && rect.size.width > 0.0
            && rect.size.height > 0.0
    );
    metrics["hidden"] = json!(hidden);
    metrics["enabled"] = json!(button.isEnabled());
    metrics
}

fn rectangle(rect: NSRect, bounds: NSRect, flipped: bool) -> Value {
    let x = rect.origin.x - bounds.origin.x;
    let y = if flipped {
        rect.origin.y - bounds.origin.y
    } else {
        bounds.origin.y + bounds.size.height - rect.origin.y - rect.size.height
    };
    json!({
        "x": x, "y": y,
        "width": rect.size.width, "height": rect.size.height,
        "centerX": x + rect.size.width / 2.0,
        "centerY": y + rect.size.height / 2.0
    })
}

#[cfg(test)]
mod tests {
    use super::rectangle;
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use serde_json::json;

    #[test]
    fn native_rectangles_normalize_bounds_and_both_axis_orientations() {
        let bounds = NSRect::new(NSPoint::new(10.0, 20.0), NSSize::new(640.0, 480.0));
        let expected =
            json!({"x":16.0,"y":8.0,"width":14.0,"height":14.0,"centerX":23.0,"centerY":15.0});
        let normal = NSRect::new(NSPoint::new(26.0, 478.0), NSSize::new(14.0, 14.0));
        let flipped = NSRect::new(NSPoint::new(26.0, 28.0), NSSize::new(14.0, 14.0));
        assert_eq!(rectangle(normal, bounds, false), expected);
        assert_eq!(rectangle(flipped, bounds, true), expected);
    }
}
