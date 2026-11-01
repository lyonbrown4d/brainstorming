# Perfect Freehand

__A Rust port of [perfect-freehand](https://github.com/steveruizok/perfect-freehand) library__

A library for creating smooth, natural-looking freehand strokes from input points. It produces an array of outline points that form a polygon around the input, perfect for drawing applications.

## Installation

Add this to your `Cargo.toml`:

```toml
[dependencies]
perfect_freehand = "0.1"
```

## Usage

The main function is `get_stroke()`, which takes an array of input points (like those from mouse movements) and returns a vector of outline points forming a smooth stroke polygon.

```rust
// pseudocode-ish
use perfect_freehand::{get_stroke, InputPoint, StrokeOptions};

fn main() {
    // Collect input points from user (e.g., mouse coordinates)
    let points = vec![
        InputPoint::Array([100.0, 100.0], Some(0.5)),
        InputPoint::Array([200.0, 150.0], Some(0.7)),
        InputPoint::Array([300.0, 100.0], Some(0.5)),
        // ... more points
    ];

    // Create default options
    let options = StrokeOptions::default();

    // Generate the stroke outline
    let outline = get_stroke(&points, &options);

    // Use the outline points to draw a path
    // (e.g., convert to SVG or render with a graphics library)
}
```

## Rendering

You can render the stroke points with any graphics library. Here's an example using a hypothetical graphics backend:

```rust
use perfect_freehand::{get_stroke, InputPoint, StrokeOptions};

fn render_stroke(points: &[InputPoint]) {
    let options = StrokeOptions::default();
    let outline = get_stroke(points, &options);
    
    // Draw the polygon outline
    for i in 0..outline.len() {
        let p1 = outline[i];
        let p2 = outline[(i + 1) % outline.len()];
        draw_line(p1, p2);
    }
}
```

To get filled strokes, you can triangulate the polygon using a library like [earcutr](https://crates.io/crates/earcutr) and then render the triangles:

```rust
use perfect_freehand::{get_stroke, InputPoint, StrokeOptions};
use earcutr::earcut;

fn render_filled_stroke(points: &[InputPoint]) {
    let options = StrokeOptions::default();
    let outline = get_stroke(points, &options);
    
    // Convert to vertex coordinates
    let mut vertices: Vec<f64> = Vec::new();
    for p in &outline {
        vertices.push(p[0]);
        vertices.push(p[1]);
    }
    
    // Triangulate
    let triangles = earcut(&vertices, &[], 2);
    
    // Draw each triangle
    for tri in triangles.chunks(3) {
        let a = outline[tri[0]];
        let b = outline[tri[1]];
        let c = outline[tri[2]];
        draw_triangle(a, b, c);
    }
}
```

---

## Acknowledgements

This project is a port of [perfect-freehand](https://github.com/steveruizok/perfect-freehand)  
by [Steve Ruiz](https://github.com/steveruizok). Huge thanks to him for the original work. This Rust implementation is based on and improves upon previous Rust ports of the library.

## License

This project is licensed __as the original__ under the [MIT License](./LICENSE).

---
Copyright (c) 2021 Steve Ruiz - Original  
Copyright (c) 2025 Sibai Eshak - Rust port