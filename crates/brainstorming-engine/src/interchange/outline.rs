pub use super::outline_encode::{encode_markdown, encode_opml, encode_text};
use super::{Imported, outline_model::workbook, xmind_xml};
use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};

const TEXT_LIMIT: usize = 8 * 1024 * 1024;
#[derive(Clone)]
pub(super) struct Topic {
  pub(super) title: String,
  pub(super) notes: Option<String>,
  pub(super) children: Vec<Topic>,
}
pub(super) struct Sheet {
  pub(super) name: String,
  pub(super) root: Topic,
}

pub fn decode_opml(bytes: &[u8]) -> Result<Imported, String> {
  if bytes.len() > TEXT_LIMIT {
    return Err("大纲文本不能超过 8 MiB".into());
  }
  let root = xmind_xml::parse(bytes, "OPML")?;
  if root.name != "opml" {
    return Err("文件不是 OPML 大纲".into());
  }
  let body = root.child("body").ok_or("OPML 缺少 body")?;
  let roots: Vec<_> = body.children.iter().collect();
  let sheets = if root
    .attrs
    .get("brainstorming")
    .is_some_and(|value| value == "workbook-v1")
  {
    let mut sheets = Vec::new();
    for wrapper in roots {
      let nested: Vec<_> = wrapper.children("outline").collect();
      if wrapper.name != "outline" || nested.len() != 1 {
        return Err("Brainstorming OPML 画布须包含一个中心主题".into());
      }
      sheets.push(Sheet {
        name: wrapper
          .attrs
          .get("text")
          .cloned()
          .unwrap_or_else(|| "导入大纲".into()),
        root: opml_topic(nested[0], 1)?,
      });
    }
    sheets
  } else {
    let title = root
      .child("head")
      .and_then(|head| head.child("title"))
      .map(|node| node.text_content())
      .unwrap_or_else(|| "导入大纲".into());
    let root_topic = if roots.len() == 1 {
      opml_topic(roots[0], 1)?
    } else {
      Topic {
        title: title.clone(),
        notes: None,
        children: roots
          .into_iter()
          .map(|node| opml_topic(node, 2))
          .collect::<Result<_, _>>()?,
      }
    };
    vec![Sheet {
      name: title,
      root: root_topic,
    }]
  };
  Ok(Imported {
    workbook: workbook(sheets)?,
    warnings: Vec::new(),
  })
}

fn opml_topic(node: &xmind_xml::Node, depth: usize) -> Result<Topic, String> {
  if depth > 128 {
    return Err("大纲超过 128 层".into());
  }
  if node.name != "outline" {
    return Err("OPML 包含无效的主题元素".into());
  }
  Ok(Topic {
    title: node
      .attrs
      .get("text")
      .or_else(|| node.attrs.get("title"))
      .cloned()
      .unwrap_or_default(),
    notes: node.attrs.get("_note").cloned(),
    children: node
      .children
      .iter()
      .map(|child| opml_topic(child, depth + 1))
      .collect::<Result<_, _>>()?,
  })
}

pub fn decode_markdown(bytes: &[u8]) -> Result<Imported, String> {
  if bytes.len() > TEXT_LIMIT {
    return Err("大纲文本不能超过 8 MiB".into());
  }
  let source = std::str::from_utf8(bytes).map_err(|_| "Markdown 不是有效 UTF-8")?;
  let mut sheets = Vec::new();
  let mut name = "导入大纲".to_string();
  let mut roots = Vec::new();
  let mut headings: Vec<(u8, Vec<usize>)> = Vec::new();
  let mut items: Vec<Topic> = Vec::new();
  let mut top_list = Vec::new();
  let mut block = String::new();
  let mut heading = None;
  let mut paragraph = false;
  let mut list_depth = 0;
  for event in Parser::new(source) {
    match event {
      Event::Start(Tag::Heading { level, .. }) => {
        heading = Some(level_number(level));
        block.clear();
      }
      Event::End(TagEnd::Heading(_)) => {
        let depth = heading.take().unwrap_or(2);
        if depth == 1 {
          flush(&mut sheets, &name, &mut roots);
          name = if block.is_empty() {
            "导入大纲".into()
          } else {
            block.clone()
          };
          headings.clear();
        } else {
          while headings
            .last()
            .is_some_and(|(parent_depth, _)| *parent_depth >= depth)
          {
            headings.pop();
          }
          let topic = Topic {
            title: block.clone(),
            notes: None,
            children: Vec::new(),
          };
          let path = if let Some((_, parent)) = headings.last() {
            push_at(&mut roots, parent, topic)?
          } else {
            roots.push(topic);
            vec![roots.len() - 1]
          };
          headings.push((depth, path));
        }
      }
      Event::Start(Tag::Paragraph) => {
        if items.is_empty() {
          paragraph = true;
          block.clear();
        }
      }
      Event::End(TagEnd::Paragraph) => {
        if paragraph && !block.is_empty() {
          roots.push(Topic {
            title: block.clone(),
            notes: None,
            children: Vec::new(),
          });
        }
        paragraph = false;
      }
      Event::Start(Tag::List(_)) => {
        list_depth += 1;
      }
      Event::End(TagEnd::List(_)) => {
        list_depth -= 1;
        if list_depth == 0 {
          if let Some((_, path)) = headings.last() {
            at_mut(&mut roots, path)?.children.append(&mut top_list);
          } else {
            roots.append(&mut top_list);
          }
        }
      }
      Event::Start(Tag::Item) => items.push(Topic {
        title: String::new(),
        notes: None,
        children: Vec::new(),
      }),
      Event::End(TagEnd::Item) => {
        let item = items.pop().ok_or("Markdown 列表结构无效")?;
        if let Some(parent) = items.last_mut() {
          parent.children.push(item);
        } else {
          top_list.push(item);
        }
      }
      Event::Text(value) | Event::Code(value) | Event::InlineHtml(value) => {
        if let Some(item) = items.last_mut() {
          item.title.push_str(&value);
        } else if heading.is_some() || paragraph {
          block.push_str(&value);
        }
      }
      Event::SoftBreak | Event::HardBreak => {
        if let Some(item) = items.last_mut() {
          item.title.push('\n');
        } else if heading.is_some() || paragraph {
          block.push('\n');
        }
      }
      _ => {}
    }
  }
  flush(&mut sheets, &name, &mut roots);
  if sheets.is_empty() && !source.trim().is_empty() {
    sheets.push(Sheet {
      name: name.clone(),
      root: Topic {
        title: name,
        notes: None,
        children: Vec::new(),
      },
    });
  }
  Ok(Imported {
    workbook: workbook(sheets)?,
    warnings: Vec::new(),
  })
}

fn level_number(level: HeadingLevel) -> u8 {
  match level {
    HeadingLevel::H1 => 1,
    HeadingLevel::H2 => 2,
    HeadingLevel::H3 => 3,
    HeadingLevel::H4 => 4,
    HeadingLevel::H5 => 5,
    HeadingLevel::H6 => 6,
  }
}
fn at_mut<'a>(roots: &'a mut [Topic], path: &[usize]) -> Result<&'a mut Topic, String> {
  let (index, rest) = path.split_first().ok_or("Markdown 标题路径无效")?;
  let topic = roots.get_mut(*index).ok_or("Markdown 标题路径无效")?;
  if rest.is_empty() {
    Ok(topic)
  } else {
    at_mut(&mut topic.children, rest)
  }
}
fn push_at(roots: &mut [Topic], path: &[usize], topic: Topic) -> Result<Vec<usize>, String> {
  let parent = at_mut(roots, path)?;
  parent.children.push(topic);
  let mut result = path.to_vec();
  result.push(parent.children.len() - 1);
  Ok(result)
}
fn flush(sheets: &mut Vec<Sheet>, name: &str, roots: &mut Vec<Topic>) {
  if roots.is_empty() {
    return;
  }
  let root = if roots.len() == 1 {
    roots.remove(0)
  } else {
    Topic {
      title: name.into(),
      notes: None,
      children: std::mem::take(roots),
    }
  };
  sheets.push(Sheet {
    name: name.into(),
    root,
  });
}
