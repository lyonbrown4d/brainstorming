fn main() {
  println!("cargo:rerun-if-changed=src/document/migrations");
  println!("cargo:rerun-if-changed=src/storage/migrations");
}
