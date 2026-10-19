// The policy has no platform/UI dependency; exercise its public-network trust
// boundary without starting a desktop event loop or making external requests.
type Result<T> = std::result::Result<T, String>;
#[allow(dead_code)]
#[path = "../src/media/network.rs"]
mod network;
#[test]
fn preview_policy_denies_credentials_private_transition_and_ambiguous_urls() {
  for value in [
    "file:///etc/passwd",
    "data:text/html,hello",
    "https://a:b@example.com",
    "https://example.com/\n",
    "javascript:alert(1)",
  ] {
    assert!(network::normalize(value).is_err(), "{value}");
  }
  for address in [
    "127.0.0.1",
    "10.0.0.2",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "fc00::1",
  ] {
    assert!(
      !network::public_address(address.parse().unwrap()),
      "{address}"
    );
  }
  assert!(network::public_address("93.184.216.34".parse().unwrap()));
  assert!(network::public_address(
    "2606:4700:4700::1111".parse().unwrap()
  ));
  assert_eq!(
    network::normalize("https://example.com/path#fragment").unwrap(),
    "https://example.com/path"
  );
}
#[tokio::test]
async fn cancelled_and_local_previews_never_fetch() {
  let cancelled = tokio_util::sync::CancellationToken::new();
  cancelled.cancel();
  assert!(
    network::fetch("https://example.com/", 1024, &cancelled)
      .await
      .is_err()
  );
  let cancel = tokio_util::sync::CancellationToken::new();
  assert!(
    network::fetch("http://127.0.0.1:9/", 1024, &cancel)
      .await
      .is_err()
  );
}
