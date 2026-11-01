use crate::types::{InputPoint, StrokeOptions, StrokePoint};
use crate::vec::{add, dist, is_equal, lrp, sub, uni};

/// Get an array of points as objects with an adjusted point, pressure, vector, distance, and running_length.
///
/// # Arguments
/// * `points` - An array of points with optional pressure data
/// * `options` - Options for the stroke generation
///
/// # Returns
/// An array of StrokePoint objects
pub fn get_stroke_points(points: &[InputPoint], options: &StrokeOptions) -> Vec<StrokePoint> {
    let streamline = options.streamline.unwrap_or(0.5);
    let size = options.size.unwrap_or(16.0);
    let is_complete = options.last.unwrap_or(false);

    if points.is_empty() {
        return Vec::new();
    }

    let t = 0.15 + (1.0 - streamline) * 0.85;

    let mut pts: Vec<([f64; 2], f64)> = points
        .iter()
        .map(|p| match p {
            InputPoint::Array(point, pressure) => (*point, pressure.unwrap_or(0.5)),
            InputPoint::Struct { x, y, pressure } => ([*x, *y], pressure.unwrap_or(0.5)),
        })
        .collect();

    if pts.len() == 2 {
        let last = pts[1];
        pts = vec![pts[0]];
        for i in 1..5 {
            let t = i as f64 / 4.0;
            let lerp_point = lrp(pts[0].0, last.0, t);
            pts.push((lerp_point, 0.5));
        }
    }

    if pts.len() == 1 {
        let point = pts[0];
        let new_point = add(point.0, [1.0, 1.0]);
        pts.push((new_point, point.1));
    }

    let mut stroke_points = vec![StrokePoint {
        point: [pts[0].0[0], pts[0].0[1]],
        pressure: if pts[0].1 >= 0.0 { pts[0].1 } else { 0.25 },
        vector: [1.0, 1.0],
        distance: 0.0,
        running_length: 0.0,
    }];

    let mut has_reached_minimum_length = false;
    let mut running_length = 0.0;
    let mut prev = stroke_points[0].clone();
    let max = pts.len() - 1;

    for i in 1..pts.len() {
        let point = if is_complete && i == max {
            [pts[i].0[0], pts[i].0[1]]
        } else {
            lrp(prev.point, pts[i].0, t)
        };

        if is_equal(prev.point, point) {
            continue;
        }

        let distance = dist(point, prev.point);
        running_length += distance;

        if i < max && !has_reached_minimum_length {
            if running_length < size {
                continue;
            }
            has_reached_minimum_length = true;
        }

        prev = StrokePoint {
            point,
            pressure: if pts[i].1 >= 0.0 { pts[i].1 } else { 0.5 },
            vector: uni(sub(prev.point, point)),
            distance,
            running_length,
        };

        stroke_points.push(prev.clone());
    }

    if let Some(second) = stroke_points.get(1) {
        stroke_points[0].vector = second.vector;
    }

    stroke_points
}
