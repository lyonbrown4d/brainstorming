use crate::get_stroke_radius::get_stroke_radius;
use crate::types::{StrokeOptions, StrokePoint, TaperType};
use crate::vec::{add, dist2, dpr, lrp, mul, neg, per, prj, rot_around, sub, uni};
use std::f64::consts::PI;
// This is the rate of change for simulated pressure. It could be an option.
const RATE_OF_PRESSURE_CHANGE: f64 = 0.275;

// Browser strokes seem to be off if PI is regular, a tiny offset seems to fix it
const FIXED_PI: f64 = PI + 0.0001;

/// Get an array of points (as `[x, y]`) representing the outline of a stroke.
///
/// # Arguments
/// * `points` - An array of StrokePoints as returned from `get_stroke_points`
/// * `options` - Options for the stroke generation
///
/// # Returns
/// An array of points (as `[x, y]`) that define the outline of the stroke
pub fn get_stroke_outline_points(points: &[StrokePoint], options: &StrokeOptions) -> Vec<[f64; 2]> {
    let size = options.size.unwrap_or(16.0);
    let smoothing = options.smoothing.unwrap_or(0.5);
    let thinning = options.thinning.unwrap_or(0.5);
    let simulate_pressure = options.simulate_pressure.unwrap_or(true);
    let easing_fn = options.easing.unwrap_or(|t| t);
    let start_options = options.start.clone().unwrap_or_default();
    let end_options = options.end.clone().unwrap_or_default();
    let is_complete = options.last.unwrap_or(false);

    let cap_start = start_options.cap.unwrap_or(true);
    let taper_start_ease = start_options.easing.unwrap_or(|t| t * (2.0 - t));

    let cap_end = end_options.cap.unwrap_or(true);
    let taper_end_ease = end_options.easing.unwrap_or(|t| {
        let t = t - 1.0;
        t * t * t + 1.0
    });

    // We can't do anything with an empty array or a stroke with negative size.
    if points.is_empty() || size <= 0.0 {
        return vec![];
    }

    // The total length of the line
    let total_length = points.last().unwrap().running_length;

    let taper_start = match start_options.taper {
        Some(TaperType::Bool(false)) => 0.0,
        Some(TaperType::Bool(true)) => f64::max(size, total_length),
        Some(TaperType::Number(v)) => v,
        None => 0.0,
    };

    let taper_end = match end_options.taper {
        Some(TaperType::Bool(false)) => 0.0,
        Some(TaperType::Bool(true)) => f64::max(size, total_length),
        Some(TaperType::Number(v)) => v,
        None => 0.0,
    };

    // The minimum allowed distance between points (squared)
    let min_distance = (size * smoothing).powi(2);

    // Our collected left and right points
    let mut left_pts: Vec<[f64; 2]> = Vec::new();
    let mut right_pts: Vec<[f64; 2]> = Vec::new();

    // Previous pressure (start with average of first five pressures,
    // in order to prevent fat starts for every line. Drawn lines
    // almost always start slow!
    let mut prev_pressure = points
        .iter()
        .take(10)
        .fold(points[0].pressure, |acc, curr| {
            let mut pressure = curr.pressure;
            if simulate_pressure {
                // Speed of change - how fast should the the pressure changing?
                let sp = f64::min(1.0, curr.distance / size);
                // Rate of change - how much of a change is there?
                let rp = f64::min(1.0, 1.0 - sp);
                // Accelerate the pressure
                pressure = f64::min(1.0, acc + (rp - acc) * (sp * RATE_OF_PRESSURE_CHANGE));
            }
            (acc + pressure) / 2.0
        });

    // The current radius
    let mut radius = get_stroke_radius(
        size,
        thinning,
        points.last().unwrap().pressure,
        Some(easing_fn),
    );

    // The radius of the first saved point
    let mut first_radius: Option<f64> = None;

    // Previous vector
    let mut prev_vector = points[0].vector;

    // Previous left and right points
    let mut pl = points[0].point;
    let mut pr = pl;

    // Temporary left and right points
    let mut tl = pl;
    let mut tr = pr;

    // Keep track of whether the previous point is a sharp corner
    // ... so that we don't detect the same corner twice
    let mut is_prev_point_sharp_corner = false;

    /*
      Find the outline's left and right points

      Iterating through the points and populate the rightPts and leftPts arrays,
      skipping the first and last pointsm, which will get caps later on.
    */

    for i in 0..points.len() {
        let mut pressure = points[i].pressure;
        let point = points[i].point;
        let vector = points[i].vector;
        let distance = points[i].distance;
        let running_length = points[i].running_length;

        // Removes noise from the end of the line
        if i < points.len() - 1 && total_length - running_length < 3.0 {
            continue;
        }

        /*
          Calculate the radius

          If not thinning, the current point's radius will be half the size; or
          otherwise, the size will be based on the current (real or simulated)
          pressure.
        */

        if thinning > 0.0 {
            if simulate_pressure {
                // If we're simulating pressure, then do so based on the distance
                // between the current point and the previous point, and the size
                // of the stroke. Otherwise, use the input pressure.
                let sp = f64::min(1.0, (distance) / size);
                let rp = f64::min(1.0, 1.0 - sp);
                pressure = f64::min(
                    1.0,
                    prev_pressure + (rp - prev_pressure) * (sp * RATE_OF_PRESSURE_CHANGE),
                );
            }

            radius = get_stroke_radius(size, thinning, pressure, Some(easing_fn));
        } else {
            radius = size / 2.0;
        }

        if first_radius.is_none() {
            first_radius = Some(radius);
        }

        /*
          Apply tapering

          If the current length is within the taper distance at either the
          start or the end, calculate the taper strengths. Apply the smaller
          of the two taper strengths to the radius.
        */

        let ts = if running_length < taper_start {
            taper_start_ease(running_length / taper_start)
        } else {
            1.0
        };

        let te = if total_length - running_length < taper_end {
            taper_end_ease((total_length - running_length) / taper_end)
        } else {
            1.0
        };

        radius = f64::max(0.01, radius * f64::min(ts, te));

        /* Add points to left and right */

        /*
          Handle sharp corners

          Find the difference (dot product) between the current and next vector.
          If the next vector is at more than a right angle to the current vector,
          draw a cap at the current point.
        */

        let next_vector = if i < points.len() - 1 {
            points[i + 1].vector
        } else {
            points[i].vector
        };

        let next_dpr = if i < points.len() - 1 {
            dpr(vector, next_vector)
        } else {
            1.0
        };

        let prev_dpr = dpr(vector, prev_vector);

        let is_point_sharp_corner = prev_dpr < 0.0 && !is_prev_point_sharp_corner;
        let is_next_point_sharp_corner = next_dpr < 0.0;

        if is_point_sharp_corner || is_next_point_sharp_corner {
            // It's a sharp corner. Draw a rounded cap and move on to the next point
            // Considering saving these and drawing them later? So that we can avoid
            // crossing future points.

            let offset = mul(per(prev_vector), radius);

            for i in 0..=13 {
                let t = i as f64 / 13.0;
                tl = rot_around(sub(point, offset), point, FIXED_PI * t);
                left_pts.push(tl);

                tr = rot_around(add(point, offset), point, FIXED_PI * -t);
                right_pts.push(tr);
            }

            pl = tl;
            pr = tr;

            if is_next_point_sharp_corner {
                is_prev_point_sharp_corner = true;
            }
            continue;
        }

        is_prev_point_sharp_corner = false;

        // Handle the last point
        if i == points.len() - 1 {
            let offset = mul(per(vector), radius);
            left_pts.push(sub(point, offset));
            right_pts.push(add(point, offset));
            continue;
        }

        /*
          Add regular points

          Project points to either side of the current point, using the
          calculated size as a distance. If a point's distance to the
          previous point on that side greater than the minimum distance
          (or if the corner is kinda sharp), add the points to the side's
          points array.
        */

        let offset = mul(per(lrp(next_vector, vector, next_dpr)), radius);

        tl = sub(point, offset);

        if i <= 1 || dist2(pl, tl) > min_distance {
            left_pts.push(tl);
            pl = tl;
        }

        tr = add(point, offset);

        if i <= 1 || dist2(pr, tr) > min_distance {
            right_pts.push(tr);
            pr = tr;
        }

        // Set variables for next iteration
        prev_pressure = pressure;
        prev_vector = vector;
    }

    /*
      Drawing caps

      Now that we have our points on either side of the line, we need to
      draw caps at the start and end. Tapered lines don't have caps, but
      may have dots for very short lines.
    */

    let first_point = points[0].point;
    let last_point = if points.len() > 1 {
        points.last().unwrap().point
    } else {
        add(points[0].point, [1.0, 1.0])
    };

    let mut start_cap: Vec<[f64; 2]> = Vec::new();
    let mut end_cap: Vec<[f64; 2]> = Vec::new();

    /*
      Draw a dot for very short or completed strokes

      If the line is too short to gather left or right points and if the line is
      not tapered on either side, draw a dot. If the line is tapered, then only
      draw a dot if the line is both very short and complete. If we draw a dot,
      we can just return those points.
    */

    if points.len() == 1 {
        if !(taper_start > 0.0 || taper_end > 0.0) || is_complete {
            let start = prj(
                first_point,
                uni(per(sub(first_point, last_point))),
                -(first_radius.unwrap_or(radius)),
            );
            let mut dot_pts: Vec<[f64; 2]> = Vec::new();

            for i in 1..=13 {
                let t = i as f64 / 13.0;
                dot_pts.push(rot_around(start, first_point, FIXED_PI * 2.0 * t));
            }
            return dot_pts;
        }
    } else {
        /*
          Draw a start cap

          Unless the line has a tapered start, or unless the line has a tapered end
          and the line is very short, draw a start cap around the first point. Use
          the distance between the second left and right point for the cap's radius.
          Finally remove the first left and right points. :psyduck:
        */

        if taper_start > 0.0 || (taper_end > 0.0 && points.len() == 1) {
            // The start point is tapered, noop
        } else if cap_start {
            // Draw the round cap - add thirteen points rotating the right point around the start point to the left point
            for i in 1..=13 {
                let t = i as f64 / 13.0;
                let pt = rot_around(right_pts[0], first_point, FIXED_PI * t);
                start_cap.push(pt);
            }
        } else {
            // Draw the flat cap - add a point to the left and right of the start point
            let corners_vector = sub(left_pts[0], right_pts[0]);
            let offset_a = mul(corners_vector, 0.5);
            let offset_b = mul(corners_vector, 0.51);

            start_cap.push(sub(first_point, offset_a));
            start_cap.push(sub(first_point, offset_b));
            start_cap.push(add(first_point, offset_b));
            start_cap.push(add(first_point, offset_a));
        }

        /*
          Draw an end cap

          If the line does not have a tapered end, and unless the line has a tapered
          start and the line is very short, draw a cap around the last point. Finally,
          remove the last left and right points. Otherwise, add the last point. Note
          that This cap is a full-turn-and-a-half: this prevents incorrect caps on
          sharp end turns.
        */

        let direction = per(neg(points.last().unwrap().vector));

        if taper_end > 0.0 || (taper_start > 0.0 && points.len() == 1) {
            // Tapered end - push the last point to the line
            end_cap.push(last_point);
        } else if cap_end {
            // Draw the round end cap
            let start = prj(last_point, direction, radius);
            let step = 1.0 / 29.0;
            let mut t = step;
            while t < 1.0 {
                end_cap.push(rot_around(start, last_point, FIXED_PI * 3.0 * t));
                t += step;
            }
        } else {
            // Draw the flat end cap
            end_cap.push(add(last_point, mul(direction, radius)));
            end_cap.push(add(last_point, mul(direction, radius * 0.99)));
            end_cap.push(sub(last_point, mul(direction, radius * 0.99)));
            end_cap.push(sub(last_point, mul(direction, radius)));
        }
    }

    /*
      Return the points in the correct winding order: begin on the left side, then
      continue around the end cap, then come back along the right side, and finally
      complete the start cap.
    */

    let mut result = Vec::new();
    result.extend(left_pts);
    result.extend(end_cap);
    right_pts.reverse();
    result.extend(right_pts);
    result.extend(start_cap);

    result
}
