mod bootstrap;
#[cfg(feature = "e2e")]
mod fixtures;
mod initialization;
mod menu;
mod request;
pub use bootstrap::run;

pub async fn finish_shutdown(app: &tauri::AppHandle) -> Result<(), String> {
    initialization::shutdown(app).await
}
