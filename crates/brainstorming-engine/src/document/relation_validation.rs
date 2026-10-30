use super::super::{Result, error::invalid, validation::*};
use super::{boolean, choice, number, optional};
use serde_json::Value;

pub(super) fn validate(item: &Value) -> Result<()> {
  keys(
    item,
    &[
      "id",
      "from",
      "to",
      "title",
      "color",
      "width",
      "dashed",
      "arrow",
      "routing",
      "sourceAnchor",
      "targetAnchor",
      "controlPoints",
      "waypoints",
      "labelOffset",
    ],
  )?;
  if item["from"] == item["to"] {
    return Err(invalid("关联线须连接两个不同主题"));
  }
  optional(item, "routing", |v| {
    choice(v, &["straight", "curve", "orthogonal"])
  })?;
  for field in ["sourceAnchor", "targetAnchor"] {
    optional(item, field, |v| {
      choice(v, &["top", "right", "bottom", "left"])
    })?;
  }
  let point = |v: &Value| -> Result<()> {
    keys(v, &["x", "y"])?;
    number(&v["x"], -1_000_000., 1_000_000.)?;
    number(&v["y"], -1_000_000., 1_000_000.)
  };
  optional(item, "labelOffset", point)?;
  for (field, maximum) in [("controlPoints", 2), ("waypoints", 32)] {
    optional(item, field, |v| {
      let values = list(v, maximum)?;
      if values.is_empty() || (field == "controlPoints" && values.len() != 2) {
        return Err(invalid("关联线路径控制点数量无效"));
      }
      for value in values {
        point(value)?;
      }
      Ok(())
    })?;
  }
  optional(item, "width", |v| number(v, 1., 6.))?;
  optional(item, "dashed", boolean)?;
  optional(item, "arrow", |v| choice(v, &["none", "end", "both"]))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::validate;
  use serde_json::json;

  #[test]
  fn validates_serialized_relation_geometry() {
    let value = json!({"id":"r","from":"a","to":"b","routing":"curve","sourceAnchor":"top","targetAnchor":"left","controlPoints":[{"x":10,"y":-20},{"x":20,"y":30}],"labelOffset":{"x":0,"y":40}});
    assert!(validate(&value).is_ok());
    for patch in [
      json!({"routing":"unknown"}),
      json!({"sourceAnchor":"center"}),
      json!({"controlPoints":[{"x":0,"y":0}]}),
      json!({"waypoints":[]}),
      json!({"labelOffset":{"x":1_000_001,"y":0}}),
      json!({"labelOffset":{"x":0,"y":0,"selected":true}}),
    ] {
      let mut invalid = value.clone();
      invalid
        .as_object_mut()
        .unwrap()
        .extend(patch.as_object().unwrap().clone());
      assert!(validate(&invalid).is_err());
    }
  }
}
