use quick_xml::{Reader, events::Event};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Node {
  pub name: String,
  pub attrs: HashMap<String, String>,
  pub children: Vec<Node>,
  pub text: String,
}

impl Node {
  pub fn child(&self, name: &str) -> Option<&Node> {
    self.children.iter().find(|node| node.name == name)
  }
  pub fn children(&self, name: &str) -> impl Iterator<Item = &Node> {
    self.children.iter().filter(move |node| node.name == name)
  }
  pub fn text_content(&self) -> String {
    self.text.clone()
  }
}

pub fn parse(bytes: &[u8], label: &str) -> Result<Node, String> {
  let source = std::str::from_utf8(bytes).map_err(|_| format!("{label} 不是有效 UTF-8"))?;
  if source.len() > 10 * 1024 * 1024 {
    return Err(format!("{label} 超过大小限制"));
  }
  let mut reader = Reader::from_str(source);
  reader.config_mut().trim_text(false);
  let mut stack: Vec<Node> = Vec::new();
  let mut root = None;
  let mut count = 0usize;
  loop {
    let event = reader
      .read_event()
      .map_err(|_| format!("{label} XML 格式无效"))?;
    let empty = matches!(event, Event::Empty(_));
    match event {
      Event::Start(start) | Event::Empty(start) => {
        count += 1;
        if count > 200_000 || stack.len() > 512 {
          return Err(format!("{label} XML 结构超出安全限制"));
        }
        let qualified = start.name();
        let raw = qualified.as_ref();
        let name = raw.rsplit(':').next().unwrap_or(raw).to_string();
        let mut attrs = HashMap::new();
        for attr in start.attributes().with_checks(true) {
          let attr = attr.map_err(|_| format!("{label} XML 属性无效"))?;
          let raw = attr.key.as_ref();
          let key = raw.rsplit(':').next().unwrap_or(raw).to_string();
          let value = attr
            .normalized_value(quick_xml::XmlVersion::Implicit1_0)
            .map_err(|_| format!("{label} XML 属性实体无效"))?
            .into_owned();
          attrs.insert(key, value);
        }
        let node = Node {
          name,
          attrs,
          children: Vec::new(),
          text: String::new(),
        };
        if empty {
          attach(node, &mut stack, &mut root)?;
        } else {
          stack.push(node);
        }
      }
      Event::End(end) => {
        let node = stack
          .pop()
          .ok_or_else(|| format!("{label} XML 结束标记无效"))?;
        let qualified = end.name();
        let raw = qualified.as_ref();
        if node.name != raw.rsplit(':').next().unwrap_or(raw) {
          return Err(format!("{label} XML 标记不匹配"));
        }
        attach(node, &mut stack, &mut root)?;
      }
      Event::Text(text) => {
        let decoded = quick_xml::escape::unescape(text.as_ref())
          .map_err(|_| format!("{label} XML 实体引用无效"))?;
        if let Some(node) = stack.last_mut() {
          node.text.push_str(&decoded);
        }
      }
      Event::CData(text) => {
        if let Some(node) = stack.last_mut() {
          node.text.push_str(text.as_ref());
        }
      }
      Event::GeneralRef(reference) => {
        let value = if let Some(ch) = reference
          .resolve_char_ref()
          .map_err(|_| format!("{label} XML 字符实体无效"))?
        {
          if ((ch as u32) < 32 && !['\t', '\n', '\r'].contains(&ch))
            || ['\u{fffe}', '\u{ffff}'].contains(&ch)
          {
            return Err(format!("{label} XML 字符实体无效"));
          }
          ch.to_string()
        } else {
          match reference.as_ref() {
            "amp" => "&",
            "lt" => "<",
            "gt" => ">",
            "quot" => "\"",
            "apos" => "'",
            _ => return Err(format!("{label} XML 包含未定义或无效的实体引用")),
          }
          .to_string()
        };
        if let Some(node) = stack.last_mut() {
          node.text.push_str(&value);
        }
      }
      Event::DocType(_) => return Err(format!("{label} 不允许 DTD 或实体声明")),
      Event::Eof => break,
      _ => {}
    }
  }
  if !stack.is_empty() {
    return Err(format!("{label} XML 没有结束"));
  }
  root.ok_or_else(|| format!("{label} XML 缺少根元素"))
}

fn attach(node: Node, stack: &mut [Node], root: &mut Option<Node>) -> Result<(), String> {
  if let Some(parent) = stack.last_mut() {
    parent.text.push_str(&node.text_content());
    parent.children.push(node);
  } else if root.replace(node).is_some() {
    return Err("XML 包含多个根元素".into());
  }
  Ok(())
}
