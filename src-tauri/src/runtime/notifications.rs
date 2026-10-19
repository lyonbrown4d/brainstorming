use crate::storage::MetadataStore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};
use tokio::sync::{Mutex, Semaphore};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Permission {
    Granted,
    Denied,
    Prompt,
    Unavailable,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    pub enabled: bool,
    pub permission: Permission,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SetEnabled {
    pub enabled: bool,
}

// This boundary accepts static application-owned copy only, never document data.
pub(crate) trait Delivery: Send + Sync {
    fn permission(&self, request: bool) -> Result<Permission, String>;
    fn show_export(&self, english: bool) -> Result<(), String>;
}
struct NativeDelivery(AppHandle);
impl Delivery for NativeDelivery {
    fn permission(&self, request: bool) -> Result<Permission, String> {
        let notification = self.0.notification();
        let state = if request {
            notification.request_permission()
        } else {
            notification.permission_state()
        }
        .map_err(|_| "通知权限读取失败")?;
        Ok(match state {
            PermissionState::Granted => Permission::Granted,
            PermissionState::Denied => Permission::Denied,
            _ => Permission::Prompt,
        })
    }
    fn show_export(&self, english: bool) -> Result<(), String> {
        let (title, body) = export_message(english);
        self.0
            .notification()
            .builder()
            .id(1)
            .title(title)
            .body(body)
            .show()
            .map_err(|_| "系统通知发送失败".into())
    }
}
fn export_message(english: bool) -> (&'static str, &'static str) {
    if english {
        ("Brainstorming", "Export completed.")
    } else {
        ("头脑风暴", "导出已完成。")
    }
}
pub(crate) struct NotificationService {
    delivery: Option<Arc<dyn Delivery>>,
    // Serialize preference changes and bound delivery to one in-flight attempt.
    operation: Mutex<()>,
    delivery_slot: Arc<Semaphore>,
    closing: Arc<AtomicBool>,
}
impl NotificationService {
    pub fn new(app: Option<AppHandle>) -> Self {
        Self {
            delivery: app.map(|app| Arc::new(NativeDelivery(app)) as Arc<dyn Delivery>),
            operation: Mutex::new(()),
            delivery_slot: Arc::new(Semaphore::new(1)),
            closing: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::Release);
        self.delivery_slot.close();
    }
    async fn permission(&self, request: bool) -> Permission {
        let Some(delivery) = self.delivery.clone() else {
            return Permission::Unavailable;
        };
        tokio::task::spawn_blocking(move || delivery.permission(request))
            .await
            .ok()
            .and_then(Result::ok)
            .unwrap_or(Permission::Unavailable)
    }
    pub async fn settings(&self, metadata: &MetadataStore) -> Result<Settings, String> {
        let _operation = self.operation.lock().await;
        Ok(Settings {
            enabled: metadata
                .notifications_enabled()
                .await
                .map_err(|_| "无法读取通知设置")?,
            permission: self.permission(false).await,
        })
    }
    pub async fn set_enabled(
        &self,
        metadata: &MetadataStore,
        enabled: bool,
    ) -> Result<Settings, String> {
        let _operation = self.operation.lock().await;
        // Only the explicit settings action can request permission.
        let permission = self.permission(enabled).await;
        let enabled = enabled && permission == Permission::Granted;
        metadata
            .set_notifications_enabled(enabled)
            .await
            .map_err(|_| "无法保存通知设置")?;
        Ok(Settings {
            enabled,
            permission,
        })
    }
    pub async fn finish_export(
        &self,
        metadata: &MetadataStore,
        english: bool,
        result: Result<Value, String>,
    ) -> Result<Value, String> {
        // Cancellation is null. Failed or cancelled exports must never notify.
        if result.as_ref().is_ok_and(Value::is_string) {
            self.export_completed(metadata, english).await;
        }
        result
    }
    async fn export_completed(&self, metadata: &MetadataStore, english: bool) {
        let Ok(_operation) = self.operation.try_lock() else {
            return;
        };
        if !metadata.notifications_enabled().await.unwrap_or(false) {
            return;
        }
        let Some(delivery) = self.delivery.clone() else {
            return;
        };
        let Ok(slot) = self.delivery_slot.clone().try_acquire_owned() else {
            return;
        };
        // The worker retains its slot even after timeout, so an unavailable OS
        // cannot accumulate unbounded blocking tasks or delay the completed export.
        let closing = self.closing.clone();
        let worker = tokio::task::spawn_blocking(move || {
            let _slot = slot;
            if closing.load(Ordering::Acquire) || delivery.permission(false)? != Permission::Granted
            {
                return Ok(());
            }
            if closing.load(Ordering::Acquire) {
                return Ok(());
            }
            delivery.show_export(english)
        });
        let sent = tokio::time::timeout(std::time::Duration::from_secs(2), worker).await;
        if !matches!(sent, Ok(Ok(Ok(())))) {
            tracing::warn!(
                operation = "export_notification",
                "System notification was not delivered"
            );
        }
    }
}
#[cfg(test)]
#[path = "notification_tests.rs"]
mod tests;
