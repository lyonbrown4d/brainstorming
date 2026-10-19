use tauri::AppHandle;
use zeroize::Zeroizing;

#[cfg(desktop)]
pub async fn read(_app: &AppHandle) -> Option<Zeroizing<String>> {
  tokio::task::spawn_blocking(|| {
    keyring::Entry::new("com.brainstorming.app", "ai-api-key")
      .ok()?
      .get_password()
      .ok()
      .map(Zeroizing::new)
  })
  .await
  .ok()
  .flatten()
}
#[cfg(desktop)]
pub async fn save(_app: &AppHandle, key: &str) -> bool {
  let key = Zeroizing::new(key.to_string());
  tokio::task::spawn_blocking(move || {
    let Ok(entry) = keyring::Entry::new("com.brainstorming.app", "ai-api-key") else {
      return false;
    };
    if key.is_empty() {
      matches!(
        entry.delete_credential(),
        Ok(()) | Err(keyring::Error::NoEntry)
      )
    } else {
      entry.set_password(&key).is_ok()
    }
  })
  .await
  .unwrap_or(false)
}
#[cfg(mobile)]
pub async fn read(app: &AppHandle) -> Option<Zeroizing<String>> {
  use tauri_plugin_brainstorming_native::NativeBridgeExt;
  let result = app
    .native_bridge()
    .call("readSecret", serde_json::json!({}))
    .await
    .ok()?;
  result["value"]
    .as_str()
    .map(|v| Zeroizing::new(v.to_string()))
}
#[cfg(mobile)]
pub async fn save(app: &AppHandle, key: &str) -> bool {
  use tauri_plugin_brainstorming_native::NativeBridgeExt;
  app
    .native_bridge()
    .call("writeSecret", serde_json::json!({"value":key}))
    .await
    .is_ok()
}
