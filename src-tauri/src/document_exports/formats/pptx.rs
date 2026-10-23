use super::content::{MAX_BYTES, bounded, text};
use crate::document_exports::presentation::{Block, Bounds, Scene, scenes};
use ppt_rs::generator::text::{Paragraph, Run, TextAlign, TextFrame};
use ppt_rs::{Image, Shape, ShapeFill, ShapeType, SlideContent, SlideLayout};
use serde_json::Value;
use std::io::{Cursor, Read, Write};
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

pub(super) fn encode(workbook: &Value) -> Result<Vec<u8>, String> {
  let scenes = scenes(workbook)?;
  let mut slides = Vec::new();
  let mut frames = Vec::new();
  let mut image_bytes = 0usize;
  for scene in &scenes {
    let mut slide = SlideContent::new("")
      .layout(SlideLayout::Blank)
      .notes(&scene.notes);
    let mut text_frames = Vec::new();
    for block in &scene.blocks {
      match block {
        Block::Rect(bounds, color) => {
          slide
            .shapes
            .push(shape(bounds).with_fill(ShapeFill::new(color)));
          text_frames.push(TextFrame::new().to_xml());
        }
        Block::Text(value) => {
          slide.shapes.push(
            shape(&value.bounds)
              .with_text(&value.lines.join("\n"))
              .with_fill(ShapeFill::new("FFFFFF").with_transparency(100)),
          );
          let mut frame = TextFrame::new().margins(0, 0, 0, 0);
          for line in &value.lines {
            let mut run = Run::new(line)
              .color(&value.color)
              .size((value.size * 0.75).round() as u32)
              .font(&scene.font);
            if value.bold {
              run = run.bold();
            }
            let align = match value.align.as_str() {
              "center" => TextAlign::Center,
              "right" => TextAlign::Right,
              _ => TextAlign::Left,
            };
            frame = frame.add_paragraph(
              Paragraph::new()
                .align(align)
                .spacing_after((value.size * 0.75 * 0.3).round() as u32)
                .add_run(run),
            );
          }
          text_frames.push(frame.to_xml());
        }
        Block::Image(bounds, picture, cover) => {
          image_bytes = image_bytes.saturating_add(picture.png.len());
          if image_bytes > MAX_BYTES / 2 {
            return Err("PowerPoint 图片总量超过 64 MiB 限制".into());
          }
          let mut b = bounds.clone();
          let ratio = f64::from(picture.width) / f64::from(picture.height);
          let area_ratio = b.width / b.height;
          let mut crop = (0., 0., 0., 0.);
          if *cover {
            if ratio > area_ratio {
              let trim = (1. - area_ratio / ratio) / 2.;
              crop = (trim, 0., trim, 0.);
            } else {
              let trim = (1. - ratio / area_ratio) / 2.;
              crop = (0., trim, 0., trim);
            }
          } else if ratio > area_ratio {
            let height = b.width / ratio;
            b.y += (b.height - height) / 2.;
            b.height = height;
          } else {
            let width = b.height * ratio;
            b.x += (b.width - width) / 2.;
            b.width = width;
          }
          let image = Image::from_bytes(picture.png.clone(), emu(b.width), emu(b.height), "PNG")
            .position(emu(b.x), emu(b.y))
            .with_alt_text(&picture.name)
            .with_crop(crop.0, crop.1, crop.2, crop.3);
          slide.images.push(image);
          slide.has_image = true;
        }
      }
    }
    frames.push(text_frames);
    slides.push(slide);
  }
  let archive = ppt_rs::create_pptx_with_content(text(workbook, "title"), slides)
    .map_err(|_| "PowerPoint 文档编码失败")?;
  finish(&archive, &frames, &scenes)
}

fn shape(b: &Bounds) -> Shape {
  Shape::new(
    ShapeType::Rectangle,
    emu(b.x),
    emu(b.y),
    emu(b.width),
    emu(b.height),
  )
}
fn emu(value: f64) -> u32 {
  (value * 9525.).round() as u32
}

/// The upstream builder supplies package relationships and editable shapes. Its shape API
/// currently auto-sizes text and fixes 4:3; replace only those generated sections using
/// the library's explicit TextFrame serializer and our shared 16:9 scene dimensions.
fn finish(archive: &[u8], frames: &[Vec<String>], scenes: &[Scene]) -> Result<Vec<u8>, String> {
  let mut input = ZipArchive::new(Cursor::new(archive)).map_err(|_| "PowerPoint 文档结构无效")?;
  let mut output = ZipWriter::new(Cursor::new(Vec::new()));
  let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
  let mut total = 0usize;
  for index in 0..input.len() {
    let mut entry = input
      .by_index(index)
      .map_err(|_| "PowerPoint 文档结构无效")?;
    if entry.is_dir() {
      continue;
    }
    let name = entry
      .name()
      .map_err(|_| "PowerPoint 条目名称无效")?
      .into_owned();
    if entry.size() > MAX_BYTES as u64 {
      return Err("PowerPoint 文档过大".into());
    }
    let mut bytes = Vec::new();
    entry
      .read_to_end(&mut bytes)
      .map_err(|_| "PowerPoint 文档读取失败")?;
    if name == "ppt/presentation.xml" {
      let xml = String::from_utf8(bytes).map_err(|_| "PowerPoint XML 无效")?;
      bytes = replace_slide_size(&xml)?.into_bytes();
    } else if let Some(slide) = name
      .strip_prefix("ppt/slides/slide")
      .and_then(|n| n.strip_suffix(".xml"))
      .and_then(|n| n.parse::<usize>().ok())
    {
      let xml = String::from_utf8(bytes).map_err(|_| "PowerPoint XML 无效")?;
      let scene = scenes
        .get(slide.saturating_sub(1))
        .ok_or("PowerPoint 页面编号无效")?;
      bytes =
        replace_frames(&xml, frames.get(slide - 1).ok_or("PowerPoint 文本缺失")?)?.into_bytes();
      if scene.blocks.is_empty() {
        return Err("PowerPoint 页面为空".into());
      }
    }
    total = total.saturating_add(bytes.len());
    if total > MAX_BYTES {
      return Err("PowerPoint 文档超过 128 MiB 限制".into());
    }
    output
      .start_file(name, options)
      .map_err(|_| "PowerPoint 打包失败")?;
    output
      .write_all(&bytes)
      .map_err(|_| "PowerPoint 打包失败")?;
  }
  bounded(
    output
      .finish()
      .map_err(|_| "PowerPoint 打包失败")?
      .into_inner(),
  )
}

fn replace_frames(xml: &str, frames: &[String]) -> Result<String, String> {
  let mut output = String::with_capacity(xml.len());
  let mut remainder = xml;
  for frame in frames {
    let start = remainder
      .find("<p:txBody>")
      .ok_or("PowerPoint 文本结构改变")?;
    let end = remainder[start..]
      .find("</p:txBody>")
      .ok_or("PowerPoint 文本结构改变")?
      + start
      + 11;
    output.push_str(&remainder[..start]);
    output.push_str(frame);
    remainder = &remainder[end..];
  }
  if remainder.contains("<p:txBody>") {
    return Err("PowerPoint 文本数量不匹配".into());
  }
  output.push_str(remainder);
  Ok(output)
}
fn replace_slide_size(xml: &str) -> Result<String, String> {
  let start = xml.find("<p:sldSz ").ok_or("PowerPoint 页面尺寸缺失")?;
  let end = xml[start..].find("/>").ok_or("PowerPoint 页面尺寸无效")? + start + 2;
  Ok(format!(
    "{}<p:sldSz cx=\"12192000\" cy=\"6858000\" type=\"screen16x9\"/>{}",
    &xml[..start],
    &xml[end..]
  ))
}
