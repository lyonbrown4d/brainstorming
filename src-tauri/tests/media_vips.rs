// Import the application rlib so Cargo propagates the target-specific native
// link metadata from build.rs to this integration-test executable.
#[cfg(feature = "native-ui")]
extern crate brainstorming_native;

#[allow(dead_code)]
#[path = "../src/media/vips_ffi.rs"]
mod vips_ffi;
type Result<T> = std::result::Result<T, String>;
#[allow(dead_code)]
#[path = "../src/media/temporary.rs"]
mod temporary;
#[allow(dead_code)]
#[cfg(feature = "native-ui")]
#[path = "../src/media/vips.rs"]
mod vips;
#[cfg(feature = "native-ui")]
#[test]
fn native_pipeline_preserves_full_image_dimensions_and_complete_webp_tiles() {
    // A real PNG fixture, then a native 1x1 pyramid. This catches missing codec,
    // incorrect variadic ABI/options, and broken tile enumeration together.
    use base64::Engine;
    let bytes=base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==").unwrap();
    let directory = tempfile::tempdir().unwrap();
    let artifacts = vips::prepare_bytes(&bytes, directory.path()).unwrap();
    assert_eq!((artifacts.width, artifacts.height), (1, 1));
    assert_eq!((artifacts.preview_width, artifacts.preview_height), (1, 1));
    assert_eq!(artifacts.tiles.len(), 1);
    assert_eq!(
        (
            artifacts.tiles[0].0,
            artifacts.tiles[0].1,
            artifacts.tiles[0].2
        ),
        (0, 0, 0)
    );
    let preview = std::fs::read(&artifacts.preview).unwrap();
    assert_eq!(infer::get(&preview).unwrap().mime_type(), "image/webp");
    let tile = std::fs::read(&artifacts.tiles[0].3).unwrap();
    assert_eq!(infer::get(&tile).unwrap().mime_type(), "image/webp");
}

#[cfg(feature = "native-ui")]
#[test]
fn exif_orientation_is_applied_to_derivatives_and_original_is_unchanged() {
    use base64::Engine;
    let bytes=base64::engine::general_purpose::STANDARD.decode("/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAGQAAAADoAQAAQAAADwAAAAAAAAA/+IB8ElDQ19QUk9GSUxFAAEBAAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAsclhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAAAAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAAHABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIAAAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBhcmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8AAEQgAPABkAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAH/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABYBAQEBAAAAAAAAAAAAAAAAAAAFBv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALoAgtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//Z").unwrap();
    let directory = tempfile::tempdir().unwrap();
    // Brackets belong to the granted filename, never to libvips loader options.
    let original = directory.path().join("oriented[page=999].jpg");
    std::fs::write(&original, &bytes).unwrap();
    let artifacts = vips::prepare_file_cancelled(
        &original,
        &directory.path().join("derived"),
        &tokio_util::sync::CancellationToken::new(),
    )
    .unwrap();
    assert_eq!((artifacts.width, artifacts.height), (60, 100));
    assert_eq!(
        (artifacts.preview_width, artifacts.preview_height),
        (60, 100)
    );
    assert_eq!(std::fs::read(original).unwrap(), bytes);
}

#[cfg(feature = "native-ui")]
#[test]
fn precancel_and_failed_decode_leave_no_partial_derivatives() {
    use base64::Engine;
    let directory = tempfile::tempdir().unwrap();
    let output = directory.path().join("output");
    let cancel = tokio_util::sync::CancellationToken::new();
    cancel.cancel();
    assert!(
        vips::prepare_file_cancelled(&directory.path().join("missing.png"), &output, &cancel)
            .is_err()
    );
    assert!(!output.exists());
    std::fs::create_dir(&output).unwrap();
    let bytes=base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==").unwrap();
    assert!(vips::prepare_bytes(&bytes, &output).is_err());
    assert_eq!(std::fs::read_dir(output).unwrap().count(), 0);
}
