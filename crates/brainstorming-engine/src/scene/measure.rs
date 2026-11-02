use super::util::{field, number};
use crate::layout_engine::NodeSize;
use serde_json::Value;

/// Title chrome: 10px padding above and below plus the 1.5px border on each edge.
const TITLE_CHROME: f64 = 23.0;

/// Conservative advance in em for one character, mirroring `src/layout/measure.ts`.
fn advance_em(ch: char) -> f64 {
  match ch {
    ' ' | '\t' => 0.3,
    _ if (ch as u32) > 0xff => 1.0,
    'W' | 'M' | 'm' | 'w' | '@' | '%' => 0.95,
    'A'..='Z' => 0.78,
    'a'..='z' => 0.62,
    '0'..='9' => 0.68,
    'i' | 'j' | 'l' | 't' | 'f' | 'r' | 'I' | '.' | ',' | ':' | ';' | '\'' | '`' | '!' | '|'
    | '(' | ')' | '[' | ']' | '{' | '}' | '/' | '\\' | '"' => 0.4,
    _ => 0.72,
  }
}

fn text_width(text: &[char], font: f64) -> f64 {
  text.iter().map(|ch| advance_em(*ch) * font).sum()
}

/// Greedy wrapping that follows the browser: break at spaces first, split overlong words.
fn wrap_title(title: &[char], max_text: f64, font: f64) -> (f64, f64) {
  let mut lines = 1.0_f64;
  let mut current = 0.0_f64;
  let mut longest = 0.0_f64;
  let mut gap = 0.0_f64;
  let mut line_start = true;
  let mut index = 0;
  while index < title.len() {
    let ch = title[index];
    if ch == '\n' {
      longest = longest.max(current);
      current = 0.0;
      gap = 0.0;
      lines += 1.0;
      line_start = true;
      index += 1;
      continue;
    }
    if ch.is_whitespace() {
      let start = index;
      while index < title.len() && title[index].is_whitespace() && title[index] != '\n' {
        index += 1;
      }
      if !line_start {
        gap += text_width(&title[start..index], font);
      }
      continue;
    }
    let start = index;
    while index < title.len() && !title[index].is_whitespace() {
      index += 1;
    }
    let word: f64 = text_width(&title[start..index], font);
    if word > max_text {
      if !line_start {
        longest = longest.max(current);
        current = 0.0;
        lines += 1.0;
        line_start = true;
      }
      gap = 0.0;
      for ch in &title[start..index] {
        let width = advance_em(*ch) * font;
        if !line_start && current + width > max_text {
          longest = longest.max(current);
          current = 0.0;
          lines += 1.0;
          line_start = true;
        }
        current += width;
        line_start = false;
      }
      continue;
    }
    if !line_start && current + gap + word > max_text {
      longest = longest.max(current);
      current = 0.0;
      lines += 1.0;
      line_start = true;
    }
    current += if line_start { word } else { gap + word };
    gap = 0.0;
    line_start = false;
  }
  (longest.max(current), lines)
}

pub fn insets(shape: &str) -> (f64, f64) {
  match shape {
    "ellipse" | "circle" => (0.15, 0.15),
    "diamond" => (0.25, 0.25),
    "hexagon" | "tag" => (0.16, 0.04),
    "cloud" => (0.16, 0.18),
    "speech" => (0.04, 0.18),
    "bookmark" => (0.04, 0.16),
    "flag" => (0.14, 0.04),
    _ => (0.0, 0.0),
  }
}

pub fn image_size(image: &Value) -> (f64, f64) {
  let width = number(image, "width", 1.0);
  let height = number(image, "height", 1.0);
  let scale = (200.0 / width).min(140.0 / height).min(1.0);
  (
    (width * scale).round().max(1.0),
    (height * scale).round().max(1.0),
  )
}

pub fn marker_size(metadata: &Value) -> (f64, f64, f64, f64) {
  let count = metadata["markers"].as_array().map(Vec::len).unwrap_or(0);
  let size = number(&metadata["markerStyle"], "size", 16.0);
  let width = if count == 0 {
    0.0
  } else {
    (count.min(4) as f64) * (size + 4.0) - 4.0 + if count > 4 { 28.0 } else { 0.0 }
  };
  let height = if count == 0 { 0.0 } else { size };
  let horizontal = matches!(
    field(&metadata["markerStyle"], "position"),
    "left" | "right"
  );
  (
    width,
    height,
    if horizontal && count > 0 {
      width + 60.0
    } else {
      0.0
    },
    if !horizontal && count > 0 {
      height + 24.0
    } else {
      0.0
    },
  )
}

pub fn topic(topic: &Value, root: bool) -> NodeSize {
  let mut size = measured(topic, root).0;
  let scale = number(&topic["style"], "scale", 1.0);
  size.width *= scale;
  size.height *= scale;
  size
}

pub fn content_height(topic: &Value, root: bool) -> f64 {
  measured(topic, root).1
}

fn measured(topic: &Value, root: bool) -> (NodeSize, f64) {
  let style = &topic["style"];
  let shape = field(style, "shape");
  let font = number(style, "fontSize", if root { 24.0 } else { 16.0 });
  let padding = if root { 56.0 } else { 44.0 };
  let maximum = if root { 280.0 } else { 240.0 };
  let fixed = style["width"].as_f64();
  let (inset_x, inset_y) = insets(shape);
  let (marker_width, marker_height, extra_width, extra_height) = marker_size(&topic["metadata"]);
  let vertical_padding = if extra_height > 0.0 { 12.0 } else { 0.0 };
  let max_text = fixed
    .map(|width| (width * (1.0 - inset_x * 2.0) - padding - extra_width).max(font))
    .unwrap_or(maximum - padding);
  let title: Vec<char> = field(topic, "title").chars().collect();
  let (longest, lines) = wrap_title(&title, max_text, font);
  let image = topic
    .get("image")
    .filter(|item| !item.is_null())
    .map(image_size);
  let metadata = &topic["metadata"];
  let badges = metadata["labels"]
    .as_array()
    .is_some_and(|items| !items.is_empty())
    || metadata.get("link").is_some_and(|value| !value.is_null())
    || metadata.get("task").is_some_and(|value| !value.is_null())
    || metadata
      .get("equation")
      .is_some_and(|value| !value.is_null())
    || metadata
      .get("audioAssetId")
      .is_some_and(|value| !value.is_null());
  let details = !field(topic, "notes").is_empty()
    || topic["attachments"]
      .as_array()
      .is_some_and(|items| !items.is_empty());
  let content_width = fixed
    .map(|width| width * (1.0 - inset_x * 2.0))
    .unwrap_or_else(|| {
      ((if root { 180.0_f64 } else { 112.0_f64 }) + vertical_padding)
        .max(
          (longest + padding + vertical_padding)
            .ceil()
            .min(maximum + vertical_padding),
        )
        .max(
          image
            .map(|(width, _)| width + padding + vertical_padding)
            .unwrap_or(0.0),
        )
        .max(if extra_height > 0.0 {
          marker_width + 24.0
        } else {
          0.0
        })
        + extra_width
    });
  let content_height = ((if root { 64.0_f64 } else { 44.0_f64 })
    .max(lines * (font * 1.5).ceil() + TITLE_CHROME)
    + image.map(|(_, height)| height + 12.0).unwrap_or(0.0))
  .max(marker_height + 20.0)
    + extra_height
    + if details { 28.0 } else { 0.0 }
    + if badges { 28.0 } else { 0.0 }
    + if matches!(shape, "sticky" | "card") && !field(topic, "notes").is_empty() {
      48.0
    } else {
      0.0
    }
    + if shape == "image" && image.is_none() {
      52.0
    } else {
      0.0
    };
  let width = fixed.unwrap_or_else(|| (content_width / (1.0 - inset_x * 2.0)).ceil());
  let height = (content_height / (1.0 - inset_y * 2.0)).ceil();
  let extent = width.max(height);
  (
    NodeSize {
      id: field(topic, "id").to_owned(),
      width: if shape == "circle" { extent } else { width },
      height: if shape == "circle" { extent } else { height },
    },
    content_height,
  )
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn topic_size(title: &str) -> NodeSize {
    topic(&json!({"id":"t","title":title,"children":[]}), false)
  }

  /// Captured from src/layout/measure.test.ts so the renderer and native layout stay aligned.
  #[test]
  fn title_measurement_matches_the_renderer_reference() {
    assert_eq!(topic_size("短标题").height, 47.0);
    assert_eq!(topic_size("W".repeat(10).as_str()).width, 196.0);
    let word = "WWWWWWWWWW";
    assert_eq!(
      topic_size(&format!("{word} {word} {word} {word}")).height,
      4.0 * 24.0 + 23.0
    );
    assert_eq!(topic_size(&"W".repeat(40)).height, 4.0 * 24.0 + 23.0);
    assert_eq!(topic_size("一\n二\n三").height, 3.0 * 24.0 + 23.0);
  }
}
