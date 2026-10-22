use super::presentation_validation::{boolean, bounded_text, choice, color, number, optional};
use super::{Result, error::invalid, validation::*};
use serde_json::Value;

pub(super) fn validate(item: &Value) -> Result<()> {
  keys(
    item,
    &[
      "topicId",
      "camera",
      "layout",
      "hidden",
      "notes",
      "reveal",
      "appearance",
    ],
  )?;
  optional(item, "layout", |v| {
    choice(v, &["auto", "list", "image", "structure"])
  })?;
  optional(item, "hidden", boolean)?;
  optional(item, "notes", |v| bounded_text(v, 10_000, true))?;
  optional(item, "reveal", |v| choice(v, &["all", "items"]))?;
  optional(item, "appearance", |appearance| {
    keys(appearance, &["background", "title", "body", "image"])?;
    optional(appearance, "background", color)?;
    for field in ["title", "body"] {
      optional(appearance, field, |style| {
        keys(style, &["scale", "color", "bold", "align"])?;
        optional(style, "scale", |value| number(value, 0.75, 1.5))?;
        optional(style, "color", color)?;
        optional(style, "bold", boolean)?;
        optional(style, "align", |value| {
          choice(value, &["left", "center", "right"])
        })
      })?;
    }
    optional(appearance, "image", |image| {
      keys(image, &["fit", "position"])?;
      optional(image, "fit", |value| choice(value, &["contain", "cover"]))?;
      optional(image, "position", |value| choice(value, &["left", "right"]))
    })
  })?;
  optional(item, "camera", |camera| {
    keys(camera, &["position", "target"])?;
    for field in ["position", "target"] {
      let vector = list(&camera[field], 3)?;
      if vector.len() != 3 {
        return Err(invalid("相机向量须包含三个分量"));
      }
      for component in vector {
        number(component, -10_000_000., 10_000_000.)?;
      }
    }
    Ok(())
  })
}

#[cfg(test)]
mod tests {
  use super::validate;
  use serde_json::json;

  #[test]
  fn accepts_bounded_presentation_options() {
    for layout in ["auto", "list", "image", "structure"] {
      for reveal in ["all", "items"] {
        assert!(validate(&json!({"topicId": "root", "layout": layout, "hidden": false, "notes": "演讲备注", "reveal": reveal})).is_ok());
      }
    }
  }

  #[test]
  fn accepts_slide_styles_with_bounded_sizes_and_known_image_options() {
    assert!(
      validate(&json!({"topicId":"root", "appearance":{
        "background":"#faf8f2", "title":{"scale":1.25,"color":"#234567","align":"center"},
        "body":{"bold":false,"scale":0.9}, "image":{"fit":"cover","position":"right"}
      }}))
      .is_ok()
    );
  }

  #[test]
  fn rejects_unknown_options_and_oversized_notes() {
    for options in [
      json!({"layout": "unknown"}),
      json!({"hidden": 1}),
      json!({"reveal": "unknown"}),
      json!({"notes": "x".repeat(10_001)}),
      json!({"unknown": true}),
      json!({"appearance": {"background": "url(file:///private)"}}),
      json!({"appearance": {"title": {"scale": 0.74}}}),
      json!({"appearance": {"body": {"scale": 1.51}}}),
      json!({"appearance": {"title": {"align": "justify"}}}),
      json!({"appearance": {"title": {"bold": "yes"}}}),
      json!({"appearance": {"image": {"fit": "stretch"}}}),
      json!({"appearance": {"image": {"position": "bottom"}}}),
      json!({"appearance": {"title": {"fontFile": "/private/font.ttf"}}}),
      json!({"appearance": null}),
    ] {
      assert!(validate(&options).is_err());
    }
  }
}
