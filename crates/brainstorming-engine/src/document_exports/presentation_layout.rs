use super::{Block, HEIGHT, Picture, Scene, TextBox, WIDTH, bounds};
use crate::document_exports::formats::content::text;
use serde_json::Value;
use std::sync::Arc;
#[path = "presentation_style.rs"]
mod styling;
use styling::{contrast, mix, palette, style, text_box, wrap};

struct Row {
  lines: Vec<String>,
  image: Option<Arc<Picture>>,
}
pub(super) struct Style {
  size: f64,
  color: String,
  bold: bool,
  align: String,
}

pub(super) fn compose(
  document: &Value,
  step: &Value,
  topic: &Value,
  children: &[&Value],
  picture: &mut impl FnMut(&Value) -> Result<Option<Arc<Picture>>, String>,
) -> Result<Vec<Scene>, String> {
  let (palette_bg, palette_root) = palette(document);
  let appearance = &step["appearance"];
  let background = appearance["background"].as_str().unwrap_or(&palette_bg);
  let foreground = contrast(background);
  let cover_color = appearance["background"].as_str().unwrap_or(&palette_root);
  let is_root = topic["id"] == document["rootId"];
  let main_image = picture(topic)?;
  let cover = is_root && main_image.is_none() && matches!(text(step, "layout"), "" | "auto");
  let layout = match text(step, "layout") {
    "auto" | ""
      if main_image.is_some() || children.iter().any(|topic| topic.get("image").is_some()) =>
    {
      "image"
    }
    "auto" | "" if is_root || children.len() <= 4 => "structure",
    "auto" | "" => "list",
    value => value,
  };
  let image_layout = layout == "image" && main_image.is_some();
  let focus = children.is_empty() && !image_layout;
  let split_cover = cover && !children.is_empty();
  let title_width = if split_cover { 500. } else { 1120. };
  let title_font = if cover || focus {
    match text(topic, "title").chars().count() {
      0..=12 => 80.,
      13..=26 => 64.,
      27..=48 => 44.,
      _ => 34.,
    }
  } else {
    48.
  };
  let title = style(
    &appearance["title"],
    title_font,
    if cover || focus {
      contrast(cover_color)
    } else {
      foreground
    },
  );
  let body = style(
    &appearance["body"],
    28.,
    if focus {
      contrast(cover_color)
    } else {
      foreground
    },
  );
  let title_lines = wrap(text(topic, "title"), title_width, title.size);
  let title_room = if split_cover {
    440.
  } else if focus {
    220.
  } else {
    130.
  };
  let title_capacity = (title_room / (title.size * 1.3)).floor().max(1.) as usize;
  let title_chunks: Vec<_> = title_lines.chunks(title_capacity).collect();
  let body_x = if split_cover {
    730.
  } else if image_layout && text(&appearance["image"], "position") != "right" {
    660.
  } else {
    80.
  };
  let body_width = if split_cover {
    460.
  } else if image_layout {
    540.
  } else {
    1120.
  };
  let columns = if layout == "structure" && !split_cover && !image_layout && children.len() > 1 {
    2
  } else {
    1
  };
  let cell_width = (body_width - (columns - 1) as f64 * 32.) / columns as f64;
  let cell_height = (body.size * 1.3 * 4. + 32.).max(130.);
  let top = if split_cover {
    80.
  } else if focus {
    330.
  } else {
    210.
  };
  let row_count = ((640. - top) / cell_height).floor().max(1.) as usize;
  let per_page = (row_count * columns).min(6);
  let mut rows = Vec::new();
  let sources: Vec<&Value> = if children.is_empty() {
    vec![topic]
  } else {
    children.to_vec()
  };
  for source in sources {
    let image = if children.is_empty() {
      None
    } else {
      picture(source)?
    };
    let content = if children.is_empty() {
      text(source, "notes").to_string()
    } else {
      format!(
        "{}{}{}",
        text(source, "title"),
        if text(source, "notes").is_empty() {
          ""
        } else {
          "\n"
        },
        text(source, "notes")
      )
    };
    if content.is_empty() {
      continue;
    }
    let width = cell_width - if image.is_some() { 136. } else { 0. };
    for (index, chunk) in wrap(&content, width, body.size).chunks(4).enumerate() {
      rows.push(Row {
        lines: chunk.to_vec(),
        image: if index == 0 { image.clone() } else { None },
      });
      if rows.len() > 768 {
        return Err("演示内容过长，请缩小导出范围".into());
      }
    }
  }
  let body_chunks: Vec<_> = rows.chunks(per_page).collect();
  let count = title_chunks.len().max(body_chunks.len()).max(1);
  if count > 128 {
    return Err("演示导出超过 128 页限制".into());
  }
  let notes = if text(step, "notes").trim().is_empty() {
    text(topic, "notes")
  } else {
    text(step, "notes")
  };
  let font = document["settings"]["fontFamily"]
    .as_str()
    .unwrap_or("Arial");
  let mut result = Vec::new();
  for page_index in 0..count {
    let mut blocks = vec![Block::Rect(
      bounds(0., 0., WIDTH, HEIGHT),
      background.into(),
    )];
    if cover || focus {
      blocks.push(Block::Rect(
        bounds(0., 0., if split_cover { 665. } else { WIDTH }, HEIGHT),
        cover_color.into(),
      ));
    }
    let lines = title_chunks
      .get(page_index)
      .or_else(|| title_chunks.first())
      .copied()
      .unwrap_or(&[]);
    blocks.push(Block::Text(text_box(
      bounds(
        80.,
        if split_cover { 180. } else { 65. },
        title_width,
        if cover || focus { 300. } else { 130. },
      ),
      lines.to_vec(),
      &title,
    )));
    if image_layout {
      let image_x = if text(&appearance["image"], "position") == "right" {
        700.
      } else {
        80.
      };
      blocks.push(Block::Image(
        bounds(image_x, 210., 500., 405.),
        main_image.clone().ok_or("演示图片缺失")?,
        text(&appearance["image"], "fit") == "cover",
      ));
    }
    if let Some(chunk) = body_chunks.get(page_index) {
      for (index, row) in chunk.iter().enumerate() {
        let x = body_x + (index % columns) as f64 * (cell_width + 32.);
        let y = top + (index / columns) as f64 * cell_height;
        if columns == 2 {
          blocks.push(Block::Rect(
            bounds(x - 12., y - 8., cell_width + 12., cell_height - 12.),
            mix(background, foreground, 0.05),
          ));
        }
        let offset = if let Some(image) = &row.image {
          blocks.push(Block::Image(bounds(x, y, 112., 112.), image.clone(), false));
          136.
        } else {
          0.
        };
        blocks.push(Block::Text(text_box(
          bounds(x + offset, y, cell_width - offset, cell_height - 20.),
          row.lines.clone(),
          &body,
        )));
      }
    }
    blocks.push(Block::Text(TextBox {
      bounds: bounds(80., 675., 1120., 24.),
      lines: vec![format!(
        "{} · {} / {}",
        wrap(text(document, "title"), 850., 15.)
          .first()
          .map(String::as_str)
          .unwrap_or(""),
        page_index + 1,
        count
      )],
      size: 15.,
      color: if focus {
        contrast(cover_color)
      } else {
        foreground
      }
      .into(),
      bold: false,
      align: "right".into(),
    }));
    result.push(Scene {
      title: text(topic, "title").into(),
      notes: notes.into(),
      font: font.into(),
      blocks,
    });
  }
  Ok(result)
}
