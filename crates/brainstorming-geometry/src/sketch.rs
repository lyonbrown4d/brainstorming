use roughr::{
  core::{FillStyle, Options},
  generator::Generator,
};

/// Stable seed retained across native desktop and command-line exports.
pub fn sketch_path(path: &str, identity: &str, fill: bool) -> String {
  if path.is_empty() {
    return String::new();
  }
  let mut hash = 2_166_136_261u32;
  for character in identity.chars() {
    hash = (hash ^ character as u32).wrapping_mul(16_777_619);
  }
  let branch = identity.starts_with("edge:") || identity.starts_with("decoration:");
  let mut options = Options::default();
  options.seed = Some((hash % 2_147_483_646 + 1) as u64);
  options.preserve_vertices = Some(true);
  options.fixed_decimal_place_digits = Some(2.0);
  options.roughness = Some(if fill {
    0.7
  } else if branch {
    0.65
  } else {
    0.85
  });
  options.bowing = Some(if fill {
    0.6
  } else if branch {
    0.9
  } else {
    0.55
  });
  options.max_randomness_offset = Some(if fill {
    1.0
  } else if branch {
    1.1
  } else {
    1.5
  });
  options.disable_multi_stroke = Some(branch);
  if fill {
    options.fill = options.stroke.take();
    options.stroke = None;
    options.fill_style = Some(FillStyle::Hachure);
    options.hachure_angle = Some(-38.0);
    options.hachure_gap = Some(6.0);
    options.fill_weight = Some(0.8);
    options.disable_multi_stroke_fill = Some(true);
  }
  let drawing = Generator::default().path::<f64>(path.to_owned(), &Some(options));
  Generator::to_paths(drawing)
    .into_iter()
    .map(|part| part.d)
    .collect::<Vec<_>>()
    .join(" ")
}
