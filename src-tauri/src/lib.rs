pub mod builtin_art;
pub mod compute;
pub mod document;
pub mod editor_engine;
pub mod export_image;
pub mod interchange;
pub mod layout_engine;
pub mod scene;
pub mod search;
pub mod storage;
pub mod templates;
pub mod transport;

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
#[path = "../tests/document_fixture.rs"]
mod document_fixture;
