use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
  time::Duration,
};
use tauri::{Manager, PhysicalSize, Window};

type Result<T> = std::result::Result<T, String>;

struct Entry {
  size: PhysicalSize<u32>,
  pending: Option<Arc<()>>,
}

/// User-approved temporary adaptation for the CEF alpha resize regression.
/// Remove once an upstream release passes the checks in docs/cef-window-buttons.md.
#[derive(Default)]
pub struct MacChromeRestore {
  entries: Mutex<HashMap<String, Entry>>,
}

impl MacChromeRestore {
  pub fn start(&self, window: &Window) {
    if let Ok(size) = window.inner_size()
      && let Ok(mut entries) = self.entries.lock()
    {
      entries.entry(window.label().into()).or_insert(Entry {
        size,
        pending: None,
      });
    }
  }

  /// Coalesce a resize burst into one delayed official API call per window.
  pub fn schedule(&self, window: &Window, size: PhysicalSize<u32>) {
    self.schedule_change(window, size, false);
  }

  pub fn title_changed(&self, window: &Window) {
    if let Ok(size) = window.inner_size() {
      self.schedule_change(window, size, true);
    }
  }

  fn schedule_change(&self, window: &Window, size: PhysicalSize<u32>, title_changed: bool) {
    if !editor_window(window.label()) || size.width == 0 || size.height == 0 {
      return;
    }
    let token = match self.entries.lock() {
      Ok(mut entries) => {
        // Initial CEF host layout must finish before application-side changes.
        if !entries.contains_key(window.label()) {
          return;
        }
        enqueue(&mut entries, window.label(), size, title_changed)
      }
      Err(_) => {
        tracing::warn!("Window button restore scheduling unavailable");
        return;
      }
    };
    let Some(token) = token else {
      return;
    };
    // Hold no window across the delay: destruction must invalidate pending work.
    let app = window.app_handle().clone();
    let label = window.label().to_owned();
    tauri::async_runtime::spawn(async move {
      // CEF runs run_on_main_thread inline when called from Resized; this worker
      // instead lets AppKit's current titlebar layout finish before reapplying.
      tokio::time::sleep(Duration::from_millis(32)).await;
      let Some(state) = app.try_state::<MacChromeRestore>() else {
        return;
      };
      let ready = match state.entries.lock() {
        Ok(mut entries) => take_pending(&mut entries, &label, &token),
        Err(_) => false,
      };
      if !ready {
        return;
      }
      let Some(webview_window) = app.get_webview_window(&label) else {
        return;
      };
      // The pending marker is cleared before calling the setter. Any resulting
      // duplicate resize sees the recorded size and cannot schedule itself again.
      if restore(&webview_window.as_ref().window()).is_err() {
        tracing::warn!("Window button position restore failed");
      }
    });
  }

  pub fn remove(&self, window: &Window) {
    self.destroy(window.label());
  }

  pub fn destroy(&self, label: &str) {
    if let Ok(mut entries) = self.entries.lock() {
      entries.remove(label);
    }
  }
}

/// Use only Tauri's configured logical position; never mutate AppKit view frames.
pub fn restore(window: &Window) -> Result<()> {
  if !editor_window(window.label()) || window.is_fullscreen().map_err(|_| "无法读取窗口状态")?
  {
    return Ok(());
  }
  let Some(position) = window
    .app_handle()
    .config()
    .app
    .windows
    .iter()
    .find(|config| config.label == "main")
    .and_then(|config| config.traffic_light_position.as_ref())
  else {
    return Ok(());
  };
  window
    .set_traffic_light_position(tauri::LogicalPosition::new(position.x, position.y).into())
    .map_err(|_| "无法恢复窗口按钮位置".into())
}

fn editor_window(label: &str) -> bool {
  label == "main" || label.starts_with("editor-")
}

fn enqueue(
  entries: &mut HashMap<String, Entry>,
  label: &str,
  size: PhysicalSize<u32>,
  title_changed: bool,
) -> Option<Arc<()>> {
  if let Some(entry) = entries.get_mut(label) {
    if entry.size == size && !title_changed {
      return None;
    }
    entry.size = size;
    if entry.pending.is_some() {
      return None;
    }
    let token = Arc::new(());
    entry.pending = Some(token.clone());
    return Some(token);
  }
  let token = Arc::new(());
  entries.insert(
    label.to_owned(),
    Entry {
      size,
      pending: Some(token.clone()),
    },
  );
  Some(token)
}

fn take_pending(entries: &mut HashMap<String, Entry>, label: &str, token: &Arc<()>) -> bool {
  let Some(entry) = entries.get_mut(label) else {
    return false;
  };
  if !entry
    .pending
    .as_ref()
    .is_some_and(|pending| Arc::ptr_eq(pending, token))
  {
    return false;
  }
  entry.pending = None;
  true
}

#[cfg(test)]
mod tests {
  use super::{MacChromeRestore, enqueue, take_pending};
  use std::collections::HashMap;
  use tauri::PhysicalSize;

  #[test]
  fn identical_sizes_do_not_reschedule_before_or_after_the_setter() {
    let mut entries = HashMap::new();
    let size = PhysicalSize::new(1280, 800);
    let token = enqueue(&mut entries, "main", size, false).unwrap();
    assert!(enqueue(&mut entries, "main", size, false).is_none());
    assert!(take_pending(&mut entries, "main", &token));
    assert!(enqueue(&mut entries, "main", size, false).is_none());
  }

  #[test]
  fn a_resize_burst_retains_one_pending_task_with_the_latest_size() {
    let mut entries = HashMap::new();
    let token = enqueue(&mut entries, "main", PhysicalSize::new(1280, 800), false).unwrap();
    let latest = PhysicalSize::new(1440, 900);
    assert!(enqueue(&mut entries, "main", latest, false).is_none());
    assert_eq!(entries["main"].size, latest);
    assert!(take_pending(&mut entries, "main", &token));
    assert!(!take_pending(&mut entries, "main", &token));
    assert!(enqueue(&mut entries, "main", PhysicalSize::new(1280, 800), false).is_some());
  }

  #[test]
  fn a_changed_title_restores_the_same_size_once_and_joins_pending_work() {
    let mut entries = HashMap::new();
    let size = PhysicalSize::new(1280, 800);
    let first = enqueue(&mut entries, "main", size, false).unwrap();
    assert!(take_pending(&mut entries, "main", &first));
    let title = enqueue(&mut entries, "main", size, true).unwrap();
    assert!(enqueue(&mut entries, "main", size, true).is_none());
    assert!(take_pending(&mut entries, "main", &title));
    assert!(enqueue(&mut entries, "main", size, false).is_none());
  }

  #[test]
  fn destruction_cancels_work_without_affecting_a_recreated_or_other_window() {
    let state = MacChromeRestore::default();
    let size = PhysicalSize::new(1280, 800);
    let stale = enqueue(&mut state.entries.lock().unwrap(), "main", size, false).unwrap();
    let other = enqueue(
      &mut state.entries.lock().unwrap(),
      "editor-second",
      size,
      false,
    )
    .unwrap();
    state.destroy("main");
    let mut entries = state.entries.lock().unwrap();
    assert!(!take_pending(&mut entries, "main", &stale));
    let current = enqueue(&mut entries, "main", size, false).unwrap();
    assert!(!take_pending(&mut entries, "main", &stale));
    assert!(take_pending(&mut entries, "main", &current));
    assert!(take_pending(&mut entries, "editor-second", &other));
  }
}
