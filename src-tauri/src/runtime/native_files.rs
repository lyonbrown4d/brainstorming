use super::input::Result;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::FilePath;

#[cfg(mobile)]
fn target_file(app: &AppHandle) -> Result<PathBuf> {
  use tauri::Manager;
  Ok(
    app
      .path()
      .app_data_dir()
      .map_err(|_| "本机存储目录不可用")?
      .join("mobile-file-targets.json"),
  )
}
#[cfg(mobile)]
async fn targets(app: &AppHandle) -> Result<std::collections::HashMap<PathBuf, String>> {
  let path = target_file(app)?;
  match tokio::fs::read(path).await {
    Ok(bytes) if bytes.len() <= 2 * 1024 * 1024 => {
      serde_json::from_slice(&bytes).map_err(|_| "移动文件索引无效".into())
    }
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Default::default()),
    _ => Err("无法读取移动文件索引".into()),
  }
}
#[cfg(mobile)]
async fn register(app: &AppHandle, path: &Path, uri: String) -> Result<()> {
  static GATE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
  let _guard = GATE.lock().await;
  let mut entries = targets(app).await?;
  if entries.len() >= 4096 && !entries.contains_key(path) {
    return Err("移动文件索引超过限制，请清理应用内副本".into());
  }
  entries.insert(path.to_path_buf(), uri);
  super::atomic::write(
    &target_file(app)?,
    serde_json::to_vec(&entries)
      .map_err(|_| "移动文件索引无效")?
      .as_slice(),
  )
  .await
}
#[cfg(mobile)]
fn uri(path: FilePath) -> Result<String> {
  match path {
    FilePath::Path(path) => url::Url::from_file_path(path)
      .map(|u| u.to_string())
      .map_err(|_| "文件地址无效".into()),
    FilePath::Url(url) => Ok(url.to_string()),
  }
}
pub async fn stage(app: &AppHandle, path: FilePath) -> Result<PathBuf> {
  #[cfg(desktop)]
  {
    let _ = app;
    super::dialogs::local_path(path)
  }
  #[cfg(mobile)]
  {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    let uri = uri(path)?;
    let result = app
      .native_bridge()
      .call("stageFile", serde_json::json!({"uri":uri}))
      .await
      .map_err(|_| "无法读取所选文件")?;
    let local = PathBuf::from(result["path"].as_str().ok_or("原生文件路径无效")?);
    register(app, &local, uri).await?;
    Ok(local)
  }
}
#[cfg(not(feature = "e2e"))]
pub async fn destination(app: &AppHandle, path: FilePath, suggested: &str) -> Result<PathBuf> {
  #[cfg(desktop)]
  {
    let _ = (app, suggested);
    super::dialogs::local_path(path)
  }
  #[cfg(mobile)]
  {
    use tauri::Manager;
    let uri = uri(path)?;
    let folder = app
      .path()
      .app_data_dir()
      .map_err(|_| "本机存储目录不可用")?
      .join("mobile-documents")
      .join(uuid::Uuid::new_v4().to_string());
    tokio::fs::create_dir_all(&folder)
      .await
      .map_err(|_| "无法创建文档目录")?;
    let local = folder.join(super::input::safe_name(suggested));
    // Register before writing; target is retained even if native output is interrupted.
    register(app, &local, uri).await?;
    Ok(local)
  }
}
pub async fn commit(app: &AppHandle, path: &Path) -> Result<()> {
  #[cfg(mobile)]
  if let Some(uri) = targets(app).await?.get(path) {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    app
      .native_bridge()
      .call("writeFile", serde_json::json!({"uri":uri,"path":path}))
      .await
      .map_err(|_| "文件已保留在应用中，但无法写入所选位置，请重新另存为")?;
  }
  #[cfg(desktop)]
  let _ = (app, path);
  Ok(())
}

/// iOS exports the fully committed file, never a blank placeholder that could replace an existing document.
pub async fn export_completed(
  app: &AppHandle,
  source: &Path,
  suggested: &str,
  format: &str,
) -> Result<Option<PathBuf>> {
  #[cfg(target_os = "ios")]
  {
    use tauri_plugin_brainstorming_native::NativeBridgeExt;
    let response = app
      .native_bridge()
      .call(
        "exportFile",
        serde_json::json!({"path":source,"suggestedName":suggested}),
      )
      .await
      .map_err(|_| "无法导出所选文件")?;
    let Some(uri) = response["uri"].as_str() else {
      return Ok(None);
    };
    register(app, source, uri.to_string()).await?;
    let _ = format;
    Ok(Some(source.to_path_buf()))
  }
  #[cfg(not(target_os = "ios"))]
  {
    let Some(destination) = super::dialogs::save(app, suggested, format).await? else {
      return Ok(None);
    };
    super::atomic::copy(source, &destination).await?;
    commit(app, &destination).await?;
    Ok(Some(destination))
  }
}
