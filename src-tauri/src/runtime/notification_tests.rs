use super::*;
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};

struct FakeDelivery {
    permission: Permission,
    requests: AtomicUsize,
    sent: AtomicUsize,
    fail: bool,
}
impl Delivery for FakeDelivery {
    fn permission(&self, request: bool) -> Result<Permission, String> {
        if request {
            self.requests.fetch_add(1, Ordering::SeqCst);
        }
        Ok(self.permission)
    }
    fn show_export(&self, _: bool) -> Result<(), String> {
        self.sent.fetch_add(1, Ordering::SeqCst);
        if self.fail {
            Err("notification unavailable".into())
        } else {
            Ok(())
        }
    }
}
fn fixture(permission: Permission, fail: bool) -> (NotificationService, Arc<FakeDelivery>) {
    let delivery = Arc::new(FakeDelivery {
        permission,
        requests: AtomicUsize::new(0),
        sent: AtomicUsize::new(0),
        fail,
    });
    (
        NotificationService {
            delivery: Some(delivery.clone()),
            operation: Mutex::new(()),
            delivery_slot: Arc::new(Semaphore::new(1)),
            closing: Arc::new(AtomicBool::new(false)),
        },
        delivery,
    )
}
#[tokio::test]
async fn explicit_opt_in_is_persisted_and_passive_reads_never_request_permission() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("metadata.sqlite");
    let metadata = MetadataStore::new(&path).await.unwrap();
    let (service, delivery) = fixture(Permission::Granted, false);
    assert!(!service.settings(&metadata).await.unwrap().enabled);
    assert_eq!(delivery.requests.load(Ordering::SeqCst), 0);
    assert!(service.set_enabled(&metadata, true).await.unwrap().enabled);
    assert_eq!(delivery.requests.load(Ordering::SeqCst), 1);
    metadata.shutdown().await.unwrap();
    let reopened = MetadataStore::new(path).await.unwrap();
    assert!(reopened.notifications_enabled().await.unwrap());
    service.set_enabled(&reopened, false).await.unwrap();
    assert_eq!(delivery.requests.load(Ordering::SeqCst), 1);
    assert!(!reopened.notifications_enabled().await.unwrap());
    reopened.shutdown().await.unwrap();
}
#[tokio::test]
async fn only_successful_enabled_exports_send_once_and_preserve_operation_result() {
    let folder = tempfile::tempdir().unwrap();
    let metadata = MetadataStore::new(folder.path().join("metadata.sqlite"))
        .await
        .unwrap();
    let (service, delivery) = fixture(Permission::Granted, false);
    let completed = json!("/private/map-secret.pdf");
    assert_eq!(
        service
            .finish_export(&metadata, true, Ok(completed.clone()))
            .await
            .unwrap(),
        completed
    );
    assert_eq!(delivery.sent.load(Ordering::SeqCst), 0);
    service.set_enabled(&metadata, true).await.unwrap();
    assert_eq!(
        service
            .finish_export(&metadata, true, Ok(completed.clone()))
            .await
            .unwrap(),
        completed
    );
    assert_eq!(delivery.sent.load(Ordering::SeqCst), 1);
    assert!(
        service
            .finish_export(&metadata, false, Ok(Value::Null))
            .await
            .unwrap()
            .is_null()
    );
    assert_eq!(
        service
            .finish_export(&metadata, false, Err("export failed".into()))
            .await
            .unwrap_err(),
        "export failed"
    );
    assert_eq!(delivery.sent.load(Ordering::SeqCst), 1);
    assert_eq!(delivery.requests.load(Ordering::SeqCst), 1);
    metadata.shutdown().await.unwrap();
}
#[tokio::test]
async fn denied_permission_and_send_failures_cannot_fail_a_completed_export() {
    let folder = tempfile::tempdir().unwrap();
    let metadata = MetadataStore::new(folder.path().join("metadata.sqlite"))
        .await
        .unwrap();
    let (denied, delivery) = fixture(Permission::Denied, false);
    let settings = denied.set_enabled(&metadata, true).await.unwrap();
    assert!(!settings.enabled);
    assert_eq!(settings.permission, Permission::Denied);
    metadata.set_notifications_enabled(true).await.unwrap();
    let result = json!("/private/map-secret.pdf");
    assert_eq!(
        denied
            .finish_export(&metadata, false, Ok(result.clone()))
            .await
            .unwrap(),
        result
    );
    assert_eq!(delivery.sent.load(Ordering::SeqCst), 0);
    let (failing, delivery) = fixture(Permission::Granted, true);
    assert_eq!(
        failing
            .finish_export(&metadata, false, Ok(result.clone()))
            .await
            .unwrap(),
        result
    );
    assert_eq!(delivery.sent.load(Ordering::SeqCst), 1);
    metadata.shutdown().await.unwrap();
}
#[test]
fn only_static_copy_and_boolean_settings_cross_the_notification_boundary() {
    assert_eq!(export_message(true), ("Brainstorming", "Export completed."));
    assert_eq!(export_message(false), ("头脑风暴", "导出已完成。"));
    assert!(
        serde_json::from_value::<SetEnabled>(json!({"enabled":true,"body":"private content"}))
            .is_err()
    );
    assert!(serde_json::from_value::<SetEnabled>(json!({"enabled":"yes"})).is_err());
}

struct BlockedPermission {
    entered: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    release: std::sync::Mutex<std::sync::mpsc::Receiver<()>>,
    sent: AtomicUsize,
}
impl Delivery for BlockedPermission {
    fn permission(&self, _: bool) -> Result<Permission, String> {
        if let Some(entered) = self.entered.lock().unwrap().take() {
            let _ = entered.send(());
        }
        self.release.lock().unwrap().recv().unwrap();
        Ok(Permission::Granted)
    }
    fn show_export(&self, _: bool) -> Result<(), String> {
        self.sent.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}
#[tokio::test]
async fn shutdown_prevents_delivery_when_a_permission_read_finishes_late() {
    let folder = tempfile::tempdir().unwrap();
    let metadata = MetadataStore::new(folder.path().join("metadata.sqlite"))
        .await
        .unwrap();
    metadata.set_notifications_enabled(true).await.unwrap();
    let (entered, ready) = tokio::sync::oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let delivery = Arc::new(BlockedPermission {
        entered: std::sync::Mutex::new(Some(entered)),
        release: std::sync::Mutex::new(wait),
        sent: AtomicUsize::new(0),
    });
    let service = Arc::new(NotificationService {
        delivery: Some(delivery.clone()),
        operation: Mutex::new(()),
        delivery_slot: Arc::new(Semaphore::new(1)),
        closing: Arc::new(AtomicBool::new(false)),
    });
    let active = service.clone();
    let store = metadata.clone();
    let worker = tokio::spawn(async move {
        active
            .finish_export(&store, true, Ok(json!("completed.pdf")))
            .await
    });
    ready.await.unwrap();
    service.shutdown();
    release.send(()).unwrap();
    assert_eq!(worker.await.unwrap().unwrap(), json!("completed.pdf"));
    assert_eq!(delivery.sent.load(Ordering::SeqCst), 0);
    assert!(service.delivery_slot.is_closed());
    metadata.shutdown().await.unwrap();
}
