use super::util::{Svg, field, fmt};
use serde_json::Value;

const COLORS: [&str; 9] = [
  "#B42318", "#B54708", "#805B00", "#32723E", "#00766A", "#006C85", "#275DAD", "#6F42A8", "#59636D",
];

pub fn draw(svg: &mut Svg, metadata: &Value, width: f64, y: f64, color: &str, font: &str) {
  let task = &metadata["task"];
  let priority = task["priority"]
    .as_u64()
    .filter(|value| (1..=9).contains(value));
  let mut parts = Vec::new();
  if let Some(items) = task.as_object()
    && items.keys().any(|key| key != "priority")
  {
    let mut detail = if task["done"] == true {
      "✓".to_owned()
    } else {
      "○".to_owned()
    };
    if let Some(progress) = task["progress"].as_u64() {
      detail.push_str(&format!(" {progress}%"))
    }
    parts.push(detail)
  }
  if let Some(labels) = metadata["labels"].as_array() {
    let labels = labels
      .iter()
      .filter_map(Value::as_str)
      .collect::<Vec<_>>()
      .join("、");
    if !labels.is_empty() {
      parts.push(labels)
    }
  }
  if metadata["link"].is_object() {
    parts.push("链接".into())
  }
  if !field(metadata, "equation").is_empty() {
    parts.push("公式".into())
  }
  if !field(metadata, "audioAssetId").is_empty() {
    parts.push("音频".into())
  }
  let caption = parts.join(" · ");
  if priority.is_none() && caption.is_empty() {
    return;
  }
  let text = caption
    .chars()
    .take(((width - 48.0) / 7.0).max(0.0) as usize)
    .collect::<String>();
  let badge_width = if priority.is_some() { 24.0 } else { 0.0 };
  let text_width = (text.chars().count() as f64 * 7.0).min(width - badge_width - 24.0);
  let x = ((width - badge_width - text_width) / 2.0).max(8.0);
  if let Some(priority) = priority {
    let fill = COLORS[(priority - 1) as usize];
    svg.0.push_str(&format!("<svg x=\"{}\" y=\"{}\" width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" data-priority=\"{priority}\"><path d=\"M6 2h12l4 4v12l-4 4H6l-4-4V6z\" fill=\"{fill}\" stroke=\"white\" stroke-width=\"1\"/><path d=\"M7 4h10\" stroke=\"white\" stroke-opacity=\"0.35\" stroke-linecap=\"round\"/><text x=\"12\" y=\"16.5\" text-anchor=\"middle\" fill=\"white\" font-family=\"system-ui, sans-serif\" font-size=\"13\" font-weight=\"750\">{priority}</text></svg>",fmt(x),fmt(y-15.0)));
  }
  if !text.is_empty() {
    svg.text(
      &text,
      &[
        (
          "x",
          fmt(if priority.is_some() {
            x + badge_width
          } else {
            width / 2.0
          }),
        ),
        ("y", fmt(y)),
        (
          "text-anchor",
          if priority.is_some() {
            "start".into()
          } else {
            "middle".into()
          },
        ),
        ("fill", color.into()),
        ("font-family", font.into()),
        ("font-size", "10".into()),
      ],
    );
  }
}
