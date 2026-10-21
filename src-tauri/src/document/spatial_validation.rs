use super::{Result, choice, keys, number, optional};
use serde_json::Value;

pub(super) fn validate_depth(depth: &Value) -> Result<()> {
  number(depth, -1_000_000., 1_000_000.)
}

/// Validate the optional Sheet camera settings at the native document boundary.
pub(super) fn validate(spatial: &Value) -> Result<()> {
  keys(spatial, &["mode", "yaw", "pitch", "spacing", "target"])?;
  choice(&spatial["mode"], &["2d", "3d"])?;
  number(&spatial["yaw"], -std::f64::consts::PI, std::f64::consts::PI)?;
  number(
    &spatial["pitch"],
    -std::f64::consts::FRAC_PI_2,
    std::f64::consts::FRAC_PI_2,
  )?;
  number(&spatial["spacing"], 0., 200.)?;
  optional(spatial, "target", |target| {
    keys(target, &["x", "y", "z"])?;
    for axis in ["x", "y", "z"] {
      number(&target[axis], -1_000_000., 1_000_000.)?;
    }
    Ok(())
  })
}
