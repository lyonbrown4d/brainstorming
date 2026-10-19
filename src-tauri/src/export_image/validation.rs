use super::{MAX_DIMENSION, MAX_PIXELS, Request, Result};
use base64::Engine;
use resvg::usvg::roxmltree::{Document, ParsingOptions};

const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES: usize = 24 * 1024 * 1024;
const MAX_ELEMENTS: u32 = 100_000;

/// Only the static primitives emitted by the application scene generator are accepted.
/// In particular there are no filters, stylesheets, scripts, links, use expansion or sub-SVG images.
pub(super) fn scene(request: &Request) -> Result<()> {
  let document = Document::parse_with_options(
    &request.svg,
    ParsingOptions {
      allow_dtd: false,
      nodes_limit: MAX_ELEMENTS,
      ..Default::default()
    },
  )
  .map_err(|_| "导出 SVG 结构无效或超过限制")?;
  let root = document.root_element();
  if root.tag_name().name() != "svg" {
    return Err("导出 SVG 根节点无效".into());
  }
  let markers: std::collections::HashSet<_> = root
    .children()
    .filter(|node| node.has_tag_name("marker"))
    .map(|node| validate_marker(node))
    .collect::<Result<_>>()?;
  if markers.len() > 10_000 {
    return Err("导出箭头数量超过限制".into());
  }
  let mut image_bytes = 0;
  let mut image_pixels = 0;
  let mut images = 0;
  for node in document.descendants() {
    if node.is_pi() {
      return Err("导出 SVG 不能包含处理指令".into());
    }
    if !node.is_element() {
      continue;
    }
    if node.ancestors().take(65).count() > 64 {
      return Err("导出 SVG 嵌套超过限制".into());
    }
    let name = node.tag_name().name();
    if node.tag_name().namespace() != Some("http://www.w3.org/2000/svg")
      || ![
        "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text",
        "tspan", "title", "image", "marker",
      ]
      .contains(&name)
    {
      return Err("导出 SVG 包含不支持的元素".into());
    }
    if name == "marker" && node.parent() != Some(root) {
      return Err("导出箭头必须在 SVG 根节点声明".into());
    }
    for attribute in node.attributes() {
      let key = attribute.name();
      let value = attribute.value();
      let lower = value.to_ascii_lowercase();
      let allowed = [
        "x",
        "y",
        "x1",
        "x2",
        "y1",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "width",
        "height",
        "viewBox",
        "preserveAspectRatio",
        "d",
        "points",
        "transform",
        "fill",
        "stroke",
        "color",
        "fill-rule",
        "clip-rule",
        "fill-opacity",
        "stroke-opacity",
        "opacity",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-dashoffset",
        "font-family",
        "font-size",
        "font-style",
        "font-weight",
        "text-anchor",
        "dominant-baseline",
        "dx",
        "dy",
        "space",
        "role",
        "class",
        "id",
        "href",
        "version",
        "vector-effect",
        "refX",
        "refY",
        "markerWidth",
        "markerHeight",
        "orient",
        "marker-start",
        "marker-end",
      ]
      .contains(&key)
        || key.starts_with("data-")
        || key.starts_with("aria-");
      let marker_reference = ["marker-start", "marker-end"].contains(&key);
      if marker_reference {
        let id = value
          .strip_prefix("url(#")
          .and_then(|value| value.strip_suffix(')'));
        if name != "path"
          || node
            .ancestors()
            .any(|ancestor| ancestor.has_tag_name("marker"))
          || !id.is_some_and(|id| markers.contains(id))
        {
          return Err("导出箭头引用无效".into());
        }
      }
      if !allowed
        || (["fill", "stroke", "color"].contains(&key) && value.contains('\\'))
        || key.to_ascii_lowercase().starts_with("on")
        || key == "style"
        || key == "base"
        || (lower.contains("url(") && !marker_reference)
        || lower.contains("@import")
        || value.len() > 12 * 1024 * 1024
      {
        return Err("导出 SVG 属性不安全或超过限制".into());
      }
      if key == "href" {
        if name != "image" {
          return Err("导出 SVG 不允许外部引用".into());
        }
        let (bytes, pixels) = embedded_image(value)?;
        image_bytes += bytes;
        image_pixels += pixels;
        images += 1;
        if image_bytes > MAX_TOTAL_IMAGE_BYTES || image_pixels > MAX_PIXELS * 2 || images > 128 {
          return Err("导出内嵌图片总量超过限制".into());
        }
      }
    }
    if name == "image"
      && !node
        .attributes()
        .any(|attribute| attribute.name() == "href")
    {
      return Err("导出内嵌图片缺少数据".into());
    }
  }
  Ok(())
}
fn embedded_image(href: &str) -> Result<(usize, u64)> {
  let (header, encoded) = href.split_once(',').ok_or("导出图片数据无效")?;
  let expected = match header {
    "data:image/png;base64" => "image/png",
    "data:image/jpeg;base64" | "data:image/jpg;base64" => "image/jpeg",
    "data:image/webp;base64" => "image/webp",
    "data:image/gif;base64" => "image/gif",
    _ => return Err("导出仅允许内嵌 PNG、JPEG、WebP 或 GIF 图片".into()),
  };
  if encoded.len() > MAX_IMAGE_BYTES * 4 / 3 + 4 {
    return Err("导出内嵌图片超过 8 MiB 限制".into());
  }
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(encoded)
    .map_err(|_| "导出图片编码无效")?;
  let size = imagesize::blob_size(&bytes).map_err(|_| "导出图片尺寸无效")?;
  let pixels = (size.width as u64).saturating_mul(size.height as u64);
  if bytes.len() > MAX_IMAGE_BYTES
    || infer::get(&bytes).map(|kind| kind.mime_type()) != Some(expected)
    || size.width == 0
    || size.height == 0
    || size.width > MAX_DIMENSION as usize
    || size.height > MAX_DIMENSION as usize
    || pixels > MAX_PIXELS
  {
    return Err("导出内嵌图片类型或尺寸超过限制".into());
  }
  Ok((bytes.len(), pixels))
}

fn validate_marker<'a>(node: resvg::usvg::roxmltree::Node<'a, '_>) -> Result<&'a str> {
  let id = node.attribute("id").ok_or("导出箭头缺少标识")?;
  let index = id.strip_prefix("export-arrow-").ok_or("导出箭头标识无效")?;
  if index.is_empty() || index.len() > 6 || !index.bytes().all(|byte| byte.is_ascii_digit()) {
    return Err("导出箭头标识无效".into());
  }
  for (key, value) in [
    ("viewBox", "0 0 10 10"),
    ("refX", "9"),
    ("refY", "5"),
    ("markerWidth", "6"),
    ("markerHeight", "6"),
    ("orient", "auto-start-reverse"),
  ] {
    if node.attribute(key) != Some(value) {
      return Err("导出箭头尺寸无效".into());
    }
  }
  let paths: Vec<_> = node.children().filter(|node| node.is_element()).collect();
  if paths.len() != 1
    || !paths[0].has_tag_name("path")
    || paths[0].attribute("d").is_none_or(|path| path.len() > 256)
    || paths[0].children().any(|child| child.is_element())
  {
    return Err("导出箭头结构无效".into());
  }
  Ok(id)
}
