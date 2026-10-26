#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg_attr(desktop, tauri_runtime_cef::cef_entry_point)]
fn main() {
  #[cfg(all(desktop, feature = "e2e"))]
  if std::env::args().nth(1).as_deref() == Some("--e2e-browser-version") {
    use tauri_runtime_cef::cef::sys;
    println!(
      "{}.{}.{}.{}",
      sys::CHROME_VERSION_MAJOR,
      sys::CHROME_VERSION_MINOR,
      sys::CHROME_VERSION_BUILD,
      sys::CHROME_VERSION_PATCH
    );
    return;
  }
  brainstorming_native::run();
}
