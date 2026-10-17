mod bootstrap;
#[cfg(feature = "e2e")]
mod fixtures;
mod initialization;
mod menu;
mod request;
pub use bootstrap::run;

pub async fn finish_shutdown(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(media) = app.try_state::<std::sync::Arc<crate::media::MediaState>>() {
        media.revoke();
        media.shutdown().await;
    }
    if let Some(state) = app.try_state::<std::sync::Arc<crate::runtime::AppState>>() {
        state.vault.shutdown().await.map_err(|e| e.to_string())?;
        state
            .documents
            .shutdown()
            .await
            .map_err(|e| e.to_string())?;
        state.metadata.shutdown().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
