use super::{Style, TextBox};
use crate::document_exports::formats::content::text;
use serde_json::Value;
use unicode_segmentation::UnicodeSegmentation;

pub(super) fn style(value: &Value, base: f64, fallback: &str) -> Style {
  Style {
    size: base * value["scale"].as_f64().unwrap_or(1.).clamp(0.75, 1.5),
    color: value["color"].as_str().unwrap_or(fallback).into(),
    bold: value["bold"].as_bool().unwrap_or(base > 30.),
    align: value["align"].as_str().unwrap_or("left").into(),
  }
}
pub(super) fn text_box(
  bounds: crate::document_exports::presentation::Bounds,
  lines: Vec<String>,
  style: &Style,
) -> TextBox {
  TextBox {
    bounds,
    lines,
    size: style.size,
    color: style.color.clone(),
    bold: style.bold,
    align: style.align.clone(),
  }
}

/// Conservative grapheme widths keep unbroken CJK and long URLs within the same boxes.
pub(super) fn wrap(value: &str, width: f64, size: f64) -> Vec<String> {
  let mut lines = Vec::new();
  for paragraph in value.split('\n') {
    let mut line = String::new();
    let mut used = 0.;
    for word in paragraph.split_inclusive(char::is_whitespace) {
      let measure = |part: &str| {
        part
          .graphemes(true)
          .map(|g| {
            if g.is_ascii() {
              size * 0.65
            } else {
              size * 1.05
            }
          })
          .sum::<f64>()
      };
      if used + measure(word.trim_end()) > width && !line.is_empty() {
        lines.push(line.trim_end().to_owned());
        line.clear();
        used = 0.;
      }
      for part in word.graphemes(true) {
        let advance = measure(part);
        if used + advance > width && !line.is_empty() {
          lines.push(std::mem::take(&mut line));
          used = 0.;
        }
        if line.is_empty() && part.chars().all(char::is_whitespace) {
          continue;
        }
        line.push_str(part);
        used += advance;
      }
    }
    lines.push(line.trim_end().to_owned());
  }
  lines
}

pub(super) fn palette(document: &Value) -> (String, String) {
  let settings = &document["settings"];
  let (bg, root) = match text(settings, "theme") {
    "ocean" => ("#f4faff", "#276a91"),
    "forest" => ("#f6faf4", "#397851"),
    "sunset" => ("#fff8f3", "#ae5e56"),
    "mono" => ("#fafafa", "#41444c"),
    "dawn" => ("#fffdf7", "#aa7527"),
    "paper" => ("#fffef9", "#303b50"),
    "night" => ("#191c22", "#7464c4"),
    _ => ("#f7f7f2", "#41464f"),
  };
  (
    settings["background"]
      .as_str()
      .or(settings["customPalette"]["background"].as_str())
      .unwrap_or(bg)
      .into(),
    settings["customPalette"]["root"]
      .as_str()
      .unwrap_or(root)
      .into(),
  )
}
fn rgb(color: &str) -> [f64; 3] {
  let color = color.strip_prefix('#').unwrap_or(color);
  std::array::from_fn(|index| {
    color
      .get(index * 2..index * 2 + 2)
      .and_then(|part| u8::from_str_radix(part, 16).ok())
      .unwrap_or(0) as f64
  })
}
pub(super) fn contrast(color: &str) -> &'static str {
  let channels = rgb(color).map(|channel| {
    let value = channel / 255.;
    if value <= 0.04045 {
      value / 12.92
    } else {
      ((value + 0.055) / 1.055).powf(2.4)
    }
  });
  if channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.18 {
    "#242731"
  } else {
    "#ffffff"
  }
}
pub(super) fn mix(from: &str, to: &str, amount: f64) -> String {
  let a = rgb(from);
  let b = rgb(to);
  let c: [u8; 3] = std::array::from_fn(|i| (a[i] * (1. - amount) + b[i] * amount).round() as u8);
  format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
}
