pub(super) const TOPIC_SHAPES: &[&str] = &[
  "rounded",
  "rectangle",
  "ellipse",
  "text",
  "capsule",
  "circle",
  "diamond",
  "hexagon",
  "cloud",
  "speech",
  "flag",
  "bookmark",
  "tag",
  "sticky",
  "card",
  "image",
];

#[cfg(test)]
mod tests {
  use super::TOPIC_SHAPES;
  use crate::document::presentation_validation;
  use serde_json::json;

  #[test]
  fn accepts_all_appearance_shapes_and_rejects_unknown_values() {
    for shape in TOPIC_SHAPES {
      assert!(presentation_validation::topic(&json!({"style": {"shape": shape}})).is_ok());
    }
    for shape in [json!("triangle"), json!(null), json!(42)] {
      assert!(presentation_validation::topic(&json!({"style": {"shape": shape}})).is_err());
    }
  }
}
