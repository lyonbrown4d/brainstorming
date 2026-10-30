use super::Result;
use resvg::usvg::roxmltree::Node;
use std::collections::HashSet;

/// Presentation images may reference a single local rectangular clip. No
/// recursive clips, use elements, transforms, URLs or external resources.
pub(super) fn collect<'a>(root: Node<'a, '_>) -> Result<HashSet<&'a str>> {
  let mut clips = HashSet::new();
  for defs in root.children().filter(|node| node.has_tag_name("defs")) {
    for node in defs.children().filter(Node::is_element) {
      if !node.has_tag_name("clipPath") {
        return Err("导出裁剪声明无效".into());
      }
      let id = node.attribute("id").ok_or("导出裁剪缺少标识")?;
      let index = id.strip_prefix("image-").ok_or("导出裁剪标识无效")?;
      if index.is_empty()
        || index.len() > 6
        || !index.bytes().all(|byte| byte.is_ascii_digit())
        || !clips.insert(id)
      {
        return Err("导出裁剪标识重复或无效".into());
      }
      if node.attributes().any(|attribute| attribute.name() != "id") {
        return Err("导出裁剪属性无效".into());
      }
      let children: Vec<_> = node.children().filter(Node::is_element).collect();
      if children.len() != 1
        || !children[0].has_tag_name("rect")
        || children[0].children().any(|child| child.is_element())
      {
        return Err("导出仅支持矩形裁剪".into());
      }
      for attribute in children[0].attributes() {
        if !["x", "y", "width", "height"].contains(&attribute.name())
          || attribute.value().parse::<f64>().map_or(true, |value| {
            !value.is_finite() || value.abs() > 1_000_000.0
          })
        {
          return Err("导出裁剪边界无效".into());
        }
      }
    }
  }
  for clip in root
    .descendants()
    .filter(|node| node.has_tag_name("clipPath"))
  {
    if clip
      .parent()
      .is_none_or(|node| !node.has_tag_name("defs") || node.parent() != Some(root))
    {
      return Err("导出裁剪声明位置无效".into());
    }
  }
  if clips.len() > 128 {
    return Err("导出裁剪数量超过限制".into());
  }
  Ok(clips)
}
pub(super) fn valid_reference(value: &str, clips: &HashSet<&str>) -> bool {
  value
    .strip_prefix("url(#")
    .and_then(|value| value.strip_suffix(')'))
    .is_some_and(|id| clips.contains(id))
}
