pub use brainstorming_engine::{
  builtin_art, compute, document, document_exports, editor_engine, export_image, interchange,
  layout_engine, scene, search, storage, templates, transport,
};

#[cfg(feature = "native-ui")]
mod application;
#[cfg(feature = "native-ui")]
pub mod bindings;
#[cfg(feature = "native-ui")]
mod media;
#[cfg(feature = "native-ui")]
mod platform;
#[cfg(feature = "native-ui")]
mod runtime;

#[cfg(feature = "native-ui")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  platform::run();
}

#[cfg(all(test, feature = "native-ui"))]
#[path = "../../crates/brainstorming-engine/tests/document_fixture.rs"]
mod document_fixture;
