fn main() -> Result<(), Box<dyn std::error::Error>> {
  let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/generated/native.ts");
  brainstorming_native::bindings::export(&path)
}
