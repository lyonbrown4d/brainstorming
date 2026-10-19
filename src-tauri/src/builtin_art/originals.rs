//! Fixed original resources; never resolve a caller-provided filesystem path.
pub(super) fn get(id: &str) -> Option<&'static [u8]> {
  match id {
    "idea-sprout" => Some(include_bytes!(
      "../../builtin-art/originals/idea-sprout.png"
    )),
    "goal-launch" => Some(include_bytes!(
      "../../builtin-art/originals/goal-launch.png"
    )),
    "team-collaboration" => Some(include_bytes!(
      "../../builtin-art/originals/team-collaboration.png"
    )),
    "beach-rest" => Some(include_bytes!("../../builtin-art/originals/beach-rest.png")),
    _ => None,
  }
}
