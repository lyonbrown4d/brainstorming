use super::util::{escape, path};
use quick_xml::{Reader, events::Event};

pub fn sanitize(source: &str) -> Result<(String, String, String), String> {
  if source.len() > 64 * 1024 {
    return Err("标记图标超过限制".into());
  }
  let mut reader = Reader::from_str(source);
  reader.config_mut().trim_text(true);
  let mut out = String::new();
  let mut depth = 0usize;
  let mut viewbox = "0 0 24 24".to_owned();
  let mut root_attributes = String::new();
  let mut stack = Vec::new();
  loop {
    let event = reader.read_event().map_err(|_| "标记图标 SVG 无效")?;
    let empty = matches!(event, Event::Empty(_));
    match event {
      Event::Start(start) | Event::Empty(start) => {
        depth += 1;
        if depth > 64 {
          return Err("标记图标层级超过限制".into());
        }
        let raw = start.name();
        let name = raw.as_ref();
        if !matches!(
          name,
          "svg" | "g" | "path" | "circle" | "ellipse" | "rect" | "line" | "polyline" | "polygon"
        ) {
          return Err("标记图标含不安全标签".into());
        }
        if name != "svg" {
          out.push('<');
          out.push_str(name)
        }
        for attr in start.attributes().with_checks(true) {
          let attr = attr.map_err(|_| "标记图标属性无效")?;
          let key = attr.key.as_ref();
          let value = attr
            .normalized_value(quick_xml::XmlVersion::Implicit1_0)
            .map_err(|_| "标记属性值无效")?
            .into_owned();
          if key == "viewBox" && name == "svg" {
            if numeric_list(&value) {
              viewbox = value
            } else {
              return Err("标记视口无效".into());
            }
            continue;
          }
          if name == "svg"
            && !matches!(
              key,
              "fill"
                | "stroke"
                | "color"
                | "stroke-width"
                | "stroke-linecap"
                | "stroke-linejoin"
                | "opacity"
            )
          {
            continue;
          }
          if !matches!(
            key,
            "d"
              | "cx"
              | "cy"
              | "r"
              | "rx"
              | "ry"
              | "x"
              | "y"
              | "x1"
              | "y1"
              | "x2"
              | "y2"
              | "width"
              | "height"
              | "points"
              | "fill"
              | "stroke"
              | "color"
              | "stroke-width"
              | "stroke-linecap"
              | "stroke-linejoin"
              | "fill-rule"
              | "clip-rule"
              | "opacity"
          ) {
            continue;
          }
          let safe = if key == "d" {
            path(&value).is_ok()
          } else if key == "points"
            || key == "stroke-width"
            || key == "opacity"
            || matches!(
              key,
              "cx"
                | "cy"
                | "r"
                | "rx"
                | "ry"
                | "x"
                | "y"
                | "x1"
                | "y1"
                | "x2"
                | "y2"
                | "width"
                | "height"
            )
          {
            numeric_list(&value)
          } else if matches!(key, "fill" | "stroke" | "color") {
            color(&value)
          } else {
            matches!(
              value.as_str(),
              "round" | "square" | "butt" | "miter" | "bevel" | "evenodd" | "nonzero"
            )
          };
          if !safe {
            return Err("标记图标含不安全属性".into());
          }
          let target = if name == "svg" {
            &mut root_attributes
          } else {
            &mut out
          };
          target.push(' ');
          target.push_str(key);
          target.push_str("=\"");
          target.push_str(&escape(&value));
          target.push('"');
        }
        if name != "svg" {
          if empty {
            out.push_str("/>")
          } else {
            out.push('>')
          }
        }
        if !empty {
          stack.push(name.to_owned())
        } else {
          depth -= 1
        }
      }
      Event::End(end) => {
        let raw = end.name();
        let name = raw.as_ref();
        if stack.pop().as_deref() != Some(name) {
          return Err("标记图标标签不匹配".into());
        }
        if name != "svg" {
          out.push_str("</");
          out.push_str(name);
          out.push('>')
        }
        depth -= 1;
      }
      Event::Text(text) if !text.as_ref().trim().is_empty() => {
        return Err("标记图标不能包含文本".into());
      }
      Event::DocType(_) | Event::CData(_) | Event::GeneralRef(_) | Event::PI(_) => {
        return Err("标记图标含不安全 XML".into());
      }
      Event::Eof => break,
      _ => {}
    }
  }
  if !stack.is_empty() || depth != 0 {
    return Err("标记图标不完整".into());
  }
  Ok((viewbox, root_attributes, out))
}

fn numeric_list(value: &str) -> bool {
  value.len() < 4096
    && !value.is_empty()
    && value.bytes().all(|b| {
      b.is_ascii_digit()
        || b.is_ascii_whitespace()
        || matches!(b, b'.' | b',' | b'-' | b'+' | b'e' | b'E')
    })
}
fn color(value: &str) -> bool {
  matches!(
    value,
    "none" | "currentColor" | "transparent" | "white" | "black"
  ) || (value.starts_with('#')
    && matches!(value.len(), 4 | 5 | 7 | 9)
    && value[1..].bytes().all(|b| b.is_ascii_hexdigit()))
}
