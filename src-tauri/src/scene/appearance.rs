use super::util::{color, field, number};
use serde_json::Value;
use std::collections::HashMap;

pub struct Palette {
  pub root: String,
  pub background: String,
  pub branches: Vec<String>,
  pub font: String,
  pub line_width: f64,
}
pub struct TopicColor {
  pub fill: String,
  pub text: String,
  pub stroke: String,
  pub line_width: f64,
}

pub fn palette(document: &Value) -> Palette {
  let settings = &document["settings"];
  let (root, background, branches): (&str, &str, [&str; 5]) = match field(settings, "theme") {
    "ocean" => (
      "#276a91",
      "#f4faff",
      ["#358ac0", "#279c98", "#557bc1", "#5e9bb8", "#6589ad"],
    ),
    "forest" => (
      "#397851",
      "#f6faf4",
      ["#5c9568", "#879b4b", "#6d9a81", "#969c54", "#5c938f"],
    ),
    "sunset" => (
      "#ae5e56",
      "#fff8f3",
      ["#ce7864", "#c99443", "#b8778f", "#cb925b", "#a584a5"],
    ),
    "mono" => (
      "#41444c",
      "#fafafa",
      ["#6c7079", "#93969d", "#777b86", "#a0a3aa", "#606570"],
    ),
    "dawn" => (
      "#aa7527",
      "#fffdf7",
      ["#d6a64e", "#629cb7", "#cb8572", "#7da67a", "#a58bc1"],
    ),
    "paper" => (
      "#303b50",
      "#fffef9",
      ["#bb7462", "#728c70", "#b28b46", "#63859a", "#9286a4"],
    ),
    "night" => (
      "#7464c4",
      "#191c22",
      ["#ca8f9f", "#83b8a4", "#d9ba7d", "#87abcf", "#ad9bd8"],
    ),
    _ => (
      "#41464f",
      "#f7f7f2",
      ["#d87578", "#399f91", "#c8953d", "#5c86c6", "#9784c6"],
    ),
  };
  let custom = &settings["customPalette"];
  let branches = custom["branches"]
    .as_array()
    .filter(|items| !items.is_empty())
    .map(|items| {
      items
        .iter()
        .map(|item| color(item.as_str().unwrap_or(""), root))
        .collect()
    })
    .unwrap_or_else(|| branches.iter().map(|value| value.to_string()).collect());
  Palette {
    root: color(field(custom, "root"), root),
    background: color(
      field(settings, "background"),
      &color(field(custom, "background"), background),
    ),
    branches,
    font: field(settings, "fontFamily")
      .to_owned()
      .if_empty("system-ui, sans-serif"),
    line_width: number(settings, "lineWidth", 0.0),
  }
}

trait IfEmpty {
  fn if_empty(self, fallback: &str) -> String;
}
impl IfEmpty for String {
  fn if_empty(self, fallback: &str) -> String {
    if self.is_empty() {
      fallback.into()
    } else {
      self
    }
  }
}

fn mix(a: &str, b: &str, t: f64) -> String {
  let parse = |v: &str, offset| u8::from_str_radix(&v[offset..offset + 2], 16).unwrap_or(0) as f64;
  if a.len() != 7 || b.len() != 7 {
    return b.into();
  }
  format!(
    "#{:02x}{:02x}{:02x}",
    (parse(a, 1) * (1.0 - t) + parse(b, 1) * t).round() as u8,
    (parse(a, 3) * (1.0 - t) + parse(b, 3) * t).round() as u8,
    (parse(a, 5) * (1.0 - t) + parse(b, 5) * t).round() as u8
  )
}

fn luminance(background: &str) -> f64 {
  let channels: Vec<f64> = [1, 3, 5]
    .into_iter()
    .map(|i| u8::from_str_radix(&background[i..i + 2], 16).unwrap_or(255) as f64 / 255.0)
    .collect();
  channels
    .iter()
    .zip([0.2126, 0.7152, 0.0722])
    .map(|(channel, weight)| {
      (if *channel <= 0.04045 {
        *channel / 12.92
      } else {
        ((*channel + 0.055) / 1.055).powf(2.4)
      }) * weight
    })
    .sum::<f64>()
}

fn readable(background: &str) -> String {
  if background.len() != 7 {
    return "#242731".into();
  }
  let background = luminance(background);
  let dark = luminance("#242731");
  let dark_contrast = (background.max(dark) + 0.05) / (background.min(dark) + 0.05);
  if dark_contrast >= 4.5 {
    "#242731".into()
  } else if 1.05 / (background + 0.05) >= (background + 0.05) / 0.05 {
    "#ffffff".into()
  } else {
    "#000000".into()
  }
}

pub fn all(document: &Value, palette: &Palette) -> HashMap<String, TopicColor> {
  let topics = &document["topics"];
  let root = field(document, "rootId");
  let mut pending = vec![(root.to_owned(), 0usize, 0usize)];
  for (index, id) in document["floatingIds"]
    .as_array()
    .into_iter()
    .flatten()
    .filter_map(Value::as_str)
    .enumerate()
  {
    pending.push((id.to_owned(), index, 1));
  }
  let mut colors = HashMap::new();
  while let Some((id, index, depth)) = pending.pop() {
    if colors.contains_key(&id) || topics[&id].is_null() {
      continue;
    }
    let item = &topics[&id];
    let style = &item["style"];
    let stroke = palette
      .branches
      .get(index % palette.branches.len())
      .cloned()
      .unwrap_or_else(|| palette.root.clone());
    let fill = if field(style, "shape") == "text" {
      palette.background.clone()
    } else if !field(style, "fill").is_empty() {
      color(field(style, "fill"), &palette.background)
    } else if field(style, "shape") == "sticky" {
      "#fff1a8".into()
    } else if id == root {
      palette.root.clone()
    } else if depth == 1 {
      mix(&stroke, &palette.background, 0.78)
    } else {
      palette.background.clone()
    };
    colors.insert(
      id.clone(),
      TopicColor {
        text: color(field(style, "color"), &readable(&fill)),
        fill,
        stroke,
        line_width: number(
          style,
          "lineWidth",
          if palette.line_width > 0.0 {
            palette.line_width
          } else if depth == 1 {
            3.0
          } else {
            2.0
          },
        ),
      },
    );
    for (child_index, child) in item["children"]
      .as_array()
      .into_iter()
      .flatten()
      .filter_map(Value::as_str)
      .enumerate()
    {
      pending.push((
        child.to_owned(),
        if id == root { child_index } else { index },
        depth + 1,
      ));
    }
  }
  colors
}
