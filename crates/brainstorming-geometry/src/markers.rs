use serde_json::Value;
use std::sync::LazyLock;

static LUCIDE: LazyLock<Value> = LazyLock::new(|| {
  serde_json::from_str(include_str!("../assets/lucide.json")).expect("bundled Lucide registry")
});
static BRANDS: LazyLock<Value> = LazyLock::new(|| {
  serde_json::from_str(include_str!("../assets/simple-icons.json"))
    .expect("bundled Simple Icons registry")
});

pub fn marker_markup(marker: &str, color: &str, size: f64) -> String {
  if let Some(name) = marker.strip_prefix("simple-icons:") {
    if let Some(icon) = BRANDS["icons"].get(name) {
      if let Some(body) = icon["body"].as_str() {
        let width = icon["width"]
          .as_u64()
          .or(BRANDS["width"].as_u64())
          .unwrap_or(24);
        let height = icon["height"]
          .as_u64()
          .or(BRANDS["height"].as_u64())
          .unwrap_or(24);
        return format!(
          "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {width} {height}\" fill=\"{color}\" color=\"{color}\">{body}</svg>"
        );
      }
    }
  }
  LUCIDE
    .get(marker)
    .or_else(|| LUCIDE.get("question"))
    .and_then(Value::as_str)
    .unwrap_or("")
    .replace("__MARKER_COLOR__", color)
    .replace("__MARKER_SIZE__", &size.to_string())
}
