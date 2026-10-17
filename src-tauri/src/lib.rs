pub mod document;
pub mod storage;
pub mod transport;

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
