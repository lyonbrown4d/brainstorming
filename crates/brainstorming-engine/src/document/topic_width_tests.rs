use super::{annotation, topic};
use serde_json::json;

#[test]
fn topic_width_is_optional_finite_and_bounded() {
  for style in [json!({}), json!({"width": 80}), json!({"width": 1200})] {
    assert!(topic(&json!({"style": style})).is_ok());
  }
  for width in [json!(79), json!(1201), json!("200"), json!(null)] {
    assert!(topic(&json!({"style": {"width": width}})).is_err());
  }
}

#[test]
fn topic_scale_is_optional_finite_and_bounded() {
  for style in [
    json!({}),
    json!({"scale": 0.5}),
    json!({"scale": 1}),
    json!({"scale": 3}),
  ] {
    assert!(topic(&json!({"style": style})).is_ok());
  }
  for scale in [json!(0.49), json!(3.01), json!("2"), json!(null)] {
    assert!(topic(&json!({"style": {"scale": scale}})).is_err());
  }
}

#[test]
fn only_summary_annotations_can_reference_a_real_topic() {
  let mut group =
    json!({"id":"summary","kind":"summary","topicIds":["a"],"summaryTopicId":"summary-topic"});
  assert!(annotation("groups", &group).is_ok());
  group["kind"] = json!("boundary");
  assert!(annotation("groups", &group).is_err());
  group["kind"] = json!("summary");
  group["summaryTopicId"] = json!("");
  assert!(annotation("groups", &group).is_err());
}
