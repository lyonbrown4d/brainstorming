use super::service::DocumentExportService;
use futures_util::poll;
use std::{pin::pin, time::Duration};
use uuid::Uuid;

#[tokio::test]
async fn duplicate_jobs_and_cancellation_are_isolated_by_owner() {
  let service = DocumentExportService::default();
  let id = Uuid::new_v4();
  let active = service.enter("first", id).await.unwrap();
  assert!(matches!(service.enter("second",id).await,Err(message) if message.contains("存在")));
  assert!(!service.cancel("second", id));
  assert!(active.check().is_ok());
  assert!(service.cancel("first", id));
  assert!(active.check().is_err());
  drop(active);
  let replacement = service.enter("second", id).await.unwrap();
  assert!(replacement.check().is_ok());
}

#[tokio::test]
async fn closing_one_window_preserves_other_active_and_queued_jobs() {
  let service = DocumentExportService::default();
  let first_id = Uuid::new_v4();
  let first = service.enter("first", first_id).await.unwrap();
  let second_id = Uuid::new_v4();
  let third_id = Uuid::new_v4();
  let fourth_id = Uuid::new_v4();
  let mut second = pin!(service.enter("second", second_id));
  assert!(poll!(&mut second).is_pending());
  let mut third = pin!(service.enter("first", third_id));
  assert!(poll!(&mut third).is_pending());
  let mut fourth = pin!(service.enter("third", fourth_id));
  assert!(poll!(&mut fourth).is_pending());
  assert!(
    matches!(service.enter("third",Uuid::new_v4()).await,Err(message) if message.contains("满"))
  );
  assert!(!service.cancel("first", second_id));
  service.remember_export("first", "/first/result.pdf");
  service.remember_export("second", "/second/result.pdf");
  service.cancel_window("first");
  assert!(first.check().is_err());
  assert!(third.await.is_err());
  assert!(!service.has_export("first", "/first/result.pdf"));
  assert!(service.has_export("second", "/second/result.pdf"));
  assert!(poll!(&mut second).is_pending());
  drop(first);
  let second = tokio::time::timeout(Duration::from_secs(2), second)
    .await
    .unwrap()
    .unwrap();
  assert!(second.check().is_ok());
  drop(second);
  let fourth = tokio::time::timeout(Duration::from_secs(2), fourth)
    .await
    .unwrap()
    .unwrap();
  assert!(fourth.check().is_ok());
}

#[tokio::test]
async fn abandoning_queued_admission_releases_duplicate_id_and_capacity() {
  let service = DocumentExportService::default();
  let active = service.enter("first", Uuid::new_v4()).await.unwrap();
  let pending_id = Uuid::new_v4();
  {
    let mut abandoned = pin!(service.enter("second", pending_id));
    assert!(poll!(&mut abandoned).is_pending());
  }
  drop(active);
  let replacement =
    tokio::time::timeout(Duration::from_secs(2), service.enter("second", pending_id))
      .await
      .unwrap()
      .unwrap();
  assert!(replacement.check().is_ok());
}

#[tokio::test]
async fn shutdown_cancels_jobs_and_drains_owned_workers_before_completing() {
  let service = DocumentExportService::default();
  let active = service.enter("first", Uuid::new_v4()).await.unwrap();
  let mut pending = pin!(service.enter("second", Uuid::new_v4()));
  assert!(poll!(&mut pending).is_pending());
  let mut shutdown = pin!(service.shutdown());
  assert!(poll!(&mut shutdown).is_pending());
  assert!(active.check().is_err());
  assert!(pending.await.is_err());
  drop(active);
  tokio::time::timeout(Duration::from_secs(2), shutdown)
    .await
    .unwrap();
  assert!(service.enter("third", Uuid::new_v4()).await.is_err());
}

#[test]
fn completed_file_grants_are_window_bound_and_capacity_limited() {
  let service = DocumentExportService::default();
  for index in 0..33 {
    service.remember_export("first", &format!("/exports/{index}.pdf"));
  }
  assert!(!service.has_export("first", "/exports/0.pdf"));
  assert!(service.has_export("first", "/exports/32.pdf"));
  assert!(!service.has_export("second", "/exports/32.pdf"));
  service.remember_export("first", "/exports/1.pdf");
  service.remember_export("first", "/exports/33.pdf");
  assert!(service.has_export("first", "/exports/1.pdf"));
  assert!(!service.has_export("first", "/exports/2.pdf"));
}
