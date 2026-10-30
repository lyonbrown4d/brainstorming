//! Shared deterministic native geometry; no document, database or UI dependencies.
mod ink;
mod markers;
mod shapes;
mod sketch;
pub use ink::stroke_path;
pub use markers::marker_markup;
pub use shapes::shape_path;
pub use sketch::sketch_path;

fn fmt(value: f64) -> String {
  format!("{value:.3}")
    .trim_end_matches('0')
    .trim_end_matches('.')
    .to_owned()
}
