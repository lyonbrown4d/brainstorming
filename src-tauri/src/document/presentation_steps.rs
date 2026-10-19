use super::presentation_validation::{boolean, bounded_text, choice, number, optional};
use super::{Result, error::invalid, validation::*};
use serde_json::Value;

pub(super) fn validate(item: &Value) -> Result<()> {
    keys(
        item,
        &["topicId", "camera", "layout", "hidden", "notes", "reveal"],
    )?;
    optional(item, "layout", |v| {
        choice(v, &["auto", "list", "image", "structure"])
    })?;
    optional(item, "hidden", boolean)?;
    optional(item, "notes", |v| bounded_text(v, 10_000, true))?;
    optional(item, "reveal", |v| choice(v, &["all", "items"]))?;
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
    fn rejects_unknown_options_and_oversized_notes() {
        for options in [
            json!({"layout": "unknown"}),
            json!({"hidden": 1}),
            json!({"reveal": "unknown"}),
            json!({"notes": "x".repeat(10_001)}),
            json!({"unknown": true}),
        ] {
            assert!(validate(&options).is_err());
        }
    }
}
