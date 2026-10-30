use super::{Block, HEIGHT, Scene, WIDTH};
use crate::document_exports::formats::content::escape;
use base64::{Engine, engine::general_purpose::STANDARD};

pub(super) fn render(scene: &Scene) -> String {
  let mut svg = format!(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{WIDTH}\" height=\"{HEIGHT}\" viewBox=\"0 0 {WIDTH} {HEIGHT}\"><title>{}</title><desc>{}</desc>",
    escape(&scene.title),
    escape(&scene.notes)
  );
  for (index, block) in scene.blocks.iter().enumerate() {
    match block {
      Block::Rect(b, color) => svg.push_str(&format!(
        "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"{}\"/>",
        b.x,
        b.y,
        b.width,
        b.height,
        escape(color)
      )),
      Block::Text(t) => {
        let (x, anchor) = match t.align.as_str() {
          "center" => (t.bounds.x + t.bounds.width / 2., "middle"),
          "right" => (t.bounds.x + t.bounds.width, "end"),
          _ => (t.bounds.x, "start"),
        };
        svg.push_str(&format!("<text x=\"{x}\" y=\"{}\" fill=\"{}\" font-family=\"{}\" font-size=\"{}\" font-weight=\"{}\" text-anchor=\"{anchor}\">",t.bounds.y+t.size,escape(&t.color),escape(&scene.font),t.size,if t.bold {600}else{400}));
        for (line_index, line) in t.lines.iter().enumerate() {
          svg.push_str(&format!(
            "<tspan x=\"{x}\" dy=\"{}\">{}</tspan>",
            if line_index == 0 { 0. } else { t.size * 1.3 },
            escape(line)
          ));
        }
        svg.push_str("</text>");
      }
      Block::Image(b, image, cover) => {
        svg.push_str(&format!("<defs><clipPath id=\"image-{index}\"><rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"/></clipPath></defs><image x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" preserveAspectRatio=\"xMidYMid {}\" clip-path=\"url(#image-{index})\" href=\"data:image/png;base64,{}\"/>", b.x,b.y,b.width,b.height,b.x,b.y,b.width,b.height,if *cover {"slice"} else {"meet"},STANDARD.encode(&image.png)));
      }
    }
  }
  svg.push_str("</svg>");
  svg
}
