use super::*;

#[test]
fn secure_credential_is_bound_to_settings_revision_and_endpoint() {
  let endpoint = json!("https://example.test/v1");
  let record = json!({"revision":"current","baseURL":endpoint,"key":"example-secret"}).to_string();
  assert!(restore_key(&record, "current", &endpoint).is_some());
  assert!(restore_key(&record, "cleared", &endpoint).is_none());
  assert!(restore_key(&record, "current", &json!("https://other.test/v1")).is_none());
  assert!(restore_key(&record, "", &endpoint).is_none());
  assert!(restore_key("plaintext-secret", "current", &endpoint).is_none());
}

#[tokio::test]
async fn renderer_restart_cancels_every_active_generation() {
  let service = AIService::new(PathBuf::new());
  let first = CancellationToken::new();
  let second = CancellationToken::new();
  service
    .requests
    .lock()
    .await
    .insert("first".into(), first.clone());
  service
    .requests
    .lock()
    .await
    .insert("second".into(), second.clone());
  service.cancel("first").await;
  assert!(first.is_cancelled());
  assert!(!second.is_cancelled());
  service.cancel_all().await;
  assert!(second.is_cancelled());
  service.cancel("missing").await;
}

#[test]
fn unavailable_secure_store_exposes_notice_without_exposing_key() {
  let config = Configuration {
    settings: json!({"baseURL":"https://example.test/v1","model":"model","rememberKey":true,"structuredOutputs":true}),
    key: Zeroizing::new("example-secret".into()),
    persisted: false,
    initialized: true,
    credential_revision: "current".into(),
  };
  let view = AIService::view(&config);
  assert_eq!(view["keyStorage"], "memory");
  assert_eq!(view["hasKey"], true);
  assert!(view["notice"].is_string());
  assert!(!view.to_string().contains("example-secret"));
}
