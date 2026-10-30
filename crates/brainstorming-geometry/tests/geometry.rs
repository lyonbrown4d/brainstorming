use brainstorming_geometry::{marker_markup, shape_path, sketch_path, stroke_path};
#[test]
fn pressure_and_single_point_ink_match_live_perfect_freehand() {
  let fixtures: serde_json::Value =
    serde_json::from_str(include_str!("fixtures/ink.json")).unwrap();
  for fixture in fixtures.as_array().unwrap() {
    let points = fixture["points"]
      .as_array()
      .unwrap()
      .iter()
      .map(|p| {
        [
          p[0].as_f64().unwrap(),
          p[1].as_f64().unwrap(),
          p[2].as_f64().unwrap(),
        ]
      })
      .collect::<Vec<_>>();
    let path = stroke_path(&points, 4.0, [15.0, 20.0, 2.0, 1.5]);
    let actual = path
      .trim_start_matches('M')
      .trim_end_matches(" Z")
      .split(" L")
      .map(|p| {
        p.split(',')
          .map(|n| n.parse::<f64>().unwrap())
          .collect::<Vec<_>>()
      })
      .collect::<Vec<_>>();
    let expected = fixture["outline"].as_array().unwrap();
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter().zip(expected) {
      assert!((actual[0] - (expected[0].as_f64().unwrap() * 2.0 + 15.0)).abs() < 1e-9);
      assert!((actual[1] - (expected[1].as_f64().unwrap() * 1.5 + 20.0)).abs() < 1e-9);
    }
  }
}
#[test]
fn sketch_is_stable_and_seeded_for_strokes_and_fills() {
  let outline = shape_path("rounded", 120.0, 60.0);
  let first = sketch_path(&outline, "topic:a", false);
  assert!(!first.is_empty());
  assert_eq!(first, sketch_path(&outline, "topic:a", false));
  assert_ne!(first, sketch_path(&outline, "topic:b", false));
  let fill = sketch_path(&outline, "fill:topic:a", true);
  assert!(!fill.is_empty());
  assert_ne!(first, fill);
  assert_eq!(fill, sketch_path(&outline, "fill:topic:a", true));
}
#[test]
fn offline_markers_preserve_color_and_fallback() {
  assert!(marker_markup("star", "#123456", 24.0).contains("#123456"));
  assert!(marker_markup("simple-icons:rust", "#123456", 24.0).contains("<path"));
  assert_eq!(
    marker_markup("unknown", "#123456", 24.0),
    marker_markup("question", "#123456", 24.0)
  );
}
