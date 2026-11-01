// Declare submodules, matching the files in the `freehandlib/` directory
pub mod get_stroke;
pub mod get_stroke_outline_points;
pub mod get_stroke_points;
pub mod get_stroke_radius;
pub mod types;
pub mod utils;
pub mod vec;

// Re-export the items from the submodules so they can be used via `freehandlib`
pub use get_stroke::get_stroke;
pub use get_stroke_outline_points::get_stroke_outline_points;
pub use get_stroke_points::get_stroke_points;
pub use get_stroke_radius::get_stroke_radius;
pub use types::*;
pub use utils::get_svg_path_from_stroke;
