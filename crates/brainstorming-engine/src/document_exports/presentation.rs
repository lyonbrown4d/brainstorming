#[path = "presentation_layout.rs"]
mod layout;
#[path = "presentation_svg.rs"]
mod svg;

use super::Page;
use super::formats::content::{MAX_BYTES, Picture, picture, text};
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc};

pub(crate) const WIDTH: f64 = 1280.;
pub(crate) const HEIGHT: f64 = 720.;
const MAX_PAGES: usize = 128;

#[derive(Clone, Debug)]
pub(crate) struct Bounds {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}
#[derive(Clone, Debug)]
pub(crate) struct TextBox {
  pub bounds: Bounds,
  pub lines: Vec<String>,
  pub size: f64,
  pub color: String,
  pub bold: bool,
  pub align: String,
}
#[derive(Clone, Debug)]
pub(crate) enum Block {
  Rect(Bounds, String),
  Text(TextBox),
  Image(Bounds, Arc<Picture>, bool),
}
#[derive(Clone, Debug)]
pub(crate) struct Scene {
  pub title: String,
  pub notes: String,
  pub font: String,
  pub blocks: Vec<Block>,
}

pub(crate) fn pages(workbook: &Value) -> Result<Vec<Page>, String> {
  let mut total = 0usize;
  scenes(workbook)?
    .iter()
    .map(|scene| {
      let svg = svg::render(scene);
      total += svg.len();
      if total > MAX_BYTES / 2 {
        return Err("演示图形超过 64 MiB 限制".into());
      }
      Ok(Page {
        title: scene.title.clone(),
        svg,
        width: WIDTH,
        height: HEIGHT,
      })
    })
    .collect()
}

pub(crate) fn scenes(workbook: &Value) -> Result<Vec<Scene>, String> {
  super::formats::content::xml_safe(workbook)?;
  let mut result = Vec::new();
  let mut resource_bytes = 0usize;
  let mut decoded_bytes = 0usize;
  let mut content_bytes = 0usize;
  for sheet in workbook["sheets"].as_array().ok_or("演示导出缺少画布")? {
    let document = &sheet["document"];
    let root = text(document, "rootId");
    let steps = document["presentation"]
      .as_array()
      .filter(|steps| !steps.is_empty())
      .cloned()
      .unwrap_or_else(|| {
        std::iter::once(root)
          .chain(
            document["topics"][root]["children"]
              .as_array()
              .into_iter()
              .flatten()
              .filter_map(Value::as_str)
              .filter(|id| !floating(document, id)),
          )
          .map(|id| json!({"topicId":id}))
          .collect()
      });
    let mut pictures = HashMap::new();
    for step in steps {
      if step["hidden"] == true {
        continue;
      }
      let id = text(&step, "topicId");
      let topic = document["topics"]
        .get(id)
        .ok_or("演示页面引用的主题不存在")?;
      let mut get_picture = |topic: &Value| -> Result<Option<Arc<Picture>>, String> {
        let id = topic["image"]["assetId"].as_str().unwrap_or("");
        if let Some(cached) = pictures.get(id) {
          return Ok(Some(Arc::clone(cached)));
        }
        let value = picture(document, topic)?;
        if let Some(image) = &value {
          resource_bytes += image.png.len();
          decoded_bytes += image.width as usize * image.height as usize * 4;
          if resource_bytes > 24 * 1024 * 1024 || decoded_bytes > 24 * 1024 * 1024 {
            return Err("演示图片总量超过 24 MiB 限制".into());
          }
          pictures.insert(id.to_owned(), Arc::clone(image));
        }
        Ok(value)
      };
      let children: Vec<&Value> = topic["children"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|child| id != root || !floating(document, child))
        .map(|child| document["topics"].get(child).ok_or("演示子主题不存在"))
        .collect::<Result<_, _>>()?;
      let next = layout::compose(document, &step, topic, &children, &mut get_picture)?;
      for scene in &next {
        content_bytes += scene.title.len() + scene.notes.len() + scene.font.len();
        content_bytes += scene
          .blocks
          .iter()
          .map(|block| match block {
            Block::Text(value) => value.lines.iter().map(String::len).sum(),
            _ => 0usize,
          })
          .sum::<usize>();
      }
      if content_bytes > 8 * 1024 * 1024 {
        return Err("演示文本总量超过 8 MiB 限制".into());
      }
      if result.len() + next.len() > MAX_PAGES {
        return Err("演示导出超过 128 页限制".into());
      }
      result.extend(next);
    }
  }
  if result.is_empty() {
    return Err("没有可导出的演示页面".into());
  }
  let total = result.len();
  for (index, scene) in result.iter_mut().enumerate() {
    if let Some(Block::Text(footer)) = scene.blocks.last_mut() {
      let label = footer
        .lines
        .first()
        .and_then(|line| line.rsplit_once(" · "))
        .map(|(label, _)| label)
        .unwrap_or("");
      footer.lines = vec![format!("{label} · {} / {total}", index + 1)];
    }
  }
  Ok(result)
}

fn floating(document: &Value, id: &str) -> bool {
  document["floatingIds"]
    .as_array()
    .is_some_and(|ids| ids.iter().any(|value| value == id))
}

pub(crate) fn bounds(x: f64, y: f64, width: f64, height: f64) -> Bounds {
  Bounds {
    x,
    y,
    width,
    height,
  }
}
