use std::{env, path::PathBuf};
fn user_cache() -> PathBuf {
  if let Some(path) = env::var_os("BRAINSTORMING_NATIVE_CACHE") {
    return PathBuf::from(path);
  }
  let home = PathBuf::from(
    env::var_os("HOME")
      .or_else(|| env::var_os("USERPROFILE"))
      .expect("User home unavailable"),
  );
  if cfg!(target_os = "macos") {
    home.join("Library/Caches/brainstorming/native-vips")
  } else if cfg!(target_os = "windows") {
    env::var_os("LOCALAPPDATA")
      .map(PathBuf::from)
      .unwrap_or(home.join("AppData/Local"))
      .join("brainstorming/native-vips")
  } else {
    env::var_os("XDG_CACHE_HOME")
      .map(PathBuf::from)
      .unwrap_or(home.join(".cache"))
      .join("brainstorming/native-vips")
  }
}
fn main() {
  println!("cargo:rerun-if-changed=src/document/migrations");
  println!("cargo:rerun-if-changed=src/storage/migrations");
  for key in [
    "VIPS_LIB_DIR",
    "VIPS_FRAMEWORK_DIR",
    "BRAINSTORMING_NATIVE_CACHE",
  ] {
    println!("cargo:rerun-if-env-changed={key}");
  }
  println!("cargo:rerun-if-changed=../config/native-vips.lock.json");
  println!("cargo:rerun-if-changed=../config/native-vips-macos.lock.json");
  if env::var_os("CARGO_FEATURE_NATIVE_UI").is_none() {
    return;
  }
  let target = env::var("TARGET").expect("Cargo target unavailable");
  let host = env::var("HOST").expect("Cargo host unavailable");
  if target.contains("apple-ios") || target.contains("android") {
    let lock: serde_json::Value =
      serde_json::from_str(include_str!("../config/native-vips.lock.json"))
        .expect("Native image manifest invalid");
    if target.contains("apple-ios") {
      let cache = lock["ios"]["cacheDirectory"]
        .as_str()
        .expect("iOS image dependency not pinned");
      let slice = if target.ends_with("-sim") || target.starts_with("x86_64") {
        "ios-arm64_x86_64-simulator"
      } else {
        "ios-arm64"
      };
      let mut directory = env::var_os("VIPS_FRAMEWORK_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| user_cache().join(cache).join("extracted/vips.xcframework"));
      if directory.extension().is_some_and(|s| s == "xcframework") {
        directory = directory.join(slice);
      }
      assert!(
        directory.join("vips.framework/vips").is_file(),
        "Missing target libvips framework; run pnpm native:vips --ios"
      );
      println!("cargo:rustc-link-search=framework={}", directory.display());
      println!("cargo:rustc-link-lib=framework=vips");
    } else {
      let cache = lock["android"]["cacheDirectory"]
        .as_str()
        .expect("Android image dependency not pinned");
      let abi = if target.starts_with("aarch64") {
        "arm64-v8a"
      } else if target.starts_with("armv7") {
        "armeabi-v7a"
      } else if target.starts_with("x86_64") {
        "x86_64"
      } else {
        panic!("Unsupported Android image ABI: {target}")
      };
      let directory = env::var_os("VIPS_LIB_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| user_cache().join(cache).join("jniLibs").join(abi));
      for file in ["libvips.so", "libgobject-2.0.so"] {
        assert!(
          directory.join(file).is_file(),
          "Missing target libvips dependency; run pnpm native:vips --android"
        );
      }
      println!("cargo:rustc-link-search=native={}", directory.display());
      println!("cargo:rustc-link-lib=dylib=vips");
      println!("cargo:rustc-link-lib=dylib=gobject-2.0");
      println!(
        "cargo:rustc-link-arg=-Wl,-rpath-link,{}",
        directory.display()
      );
    }
  } else if let Some(directory) = env::var_os("VIPS_LIB_DIR") {
    let directory = PathBuf::from(directory);
    println!("cargo:rustc-link-search=native={}", directory.display());
    if target.contains("apple-darwin") {
      // Binding generation runs outside the app bundle during beforeBuildCommand.
      println!(
        "cargo:rustc-link-arg-bin=generate-bindings=-Wl,-rpath,{}",
        directory.display()
      );
      let lock: serde_json::Value =
        serde_json::from_str(include_str!("../config/native-vips-macos.lock.json"))
          .expect("macOS native image manifest invalid");
      let arch = if target.starts_with("aarch64") {
        "arm64"
      } else {
        "x64"
      };
      let binary = lock["platforms"][arch]["binary"]
        .as_str()
        .expect("macOS image library not pinned");
      let binary = std::path::Path::new(binary)
        .file_name()
        .and_then(|s| s.to_str())
        .expect("Invalid macOS image library");
      println!(
        "cargo:rustc-link-lib=dylib={}",
        binary.trim_start_matches("lib").trim_end_matches(".dylib")
      );
      println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
    } else {
      println!("cargo:rustc-link-lib=dylib=vips");
      println!("cargo:rustc-link-lib=dylib=gobject-2.0");
    }
  } else {
    assert_eq!(
      target, host,
      "Cross-compilation requires target VIPS_LIB_DIR; host libvips must not be linked"
    );
    pkg_config::Config::new()
      .atleast_version("8.15")
      .probe("vips")
      .expect("Install libvips development libraries or prepare a pinned target distribution");
  }
  tauri_build::build();
}
