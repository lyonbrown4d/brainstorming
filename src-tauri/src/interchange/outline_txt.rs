use super::{
  Imported,
  outline::{Sheet, Topic},
  outline_model::workbook,
};

pub fn decode(bytes: &[u8]) -> Result<Imported, String> {
  if bytes.len() > 8 * 1024 * 1024 {
    return Err("大纲文本不能超过 8 MiB".into());
  }
  let source = std::str::from_utf8(bytes).map_err(|_| "纯文本大纲不是有效 UTF-8")?;
  let mut sheets = Vec::new();
  for block in source.trim_end_matches('\n').split("\n\n") {
    if block.trim().is_empty() {
      continue;
    }
    let mut lines = block.lines();
    let name = lines.next().unwrap_or("导入大纲").to_string();
    let mut stack: Vec<(usize, Topic)> = Vec::new();
    let mut roots = Vec::new();
    for line in lines {
      let spaces = line.bytes().take_while(|byte| *byte == b' ').count();
      if spaces % 2 != 0 {
        return Err("纯文本大纲缩进须为两个空格的倍数".into());
      }
      let depth = spaces / 2;
      if depth >= 128 {
        return Err("大纲超过 128 层".into());
      }
      while stack
        .last()
        .is_some_and(|(parent_depth, _)| *parent_depth >= depth)
      {
        attach(&mut stack, &mut roots)?;
      }
      if depth > 0
        && stack
          .last()
          .is_none_or(|(parent_depth, _)| *parent_depth + 1 != depth)
      {
        return Err("纯文本大纲跳过了父主题层级".into());
      }
      stack.push((
        depth,
        Topic {
          title: line[spaces..].replace("\\n", "\n"),
          notes: None,
          children: Vec::new(),
        },
      ));
    }
    while !stack.is_empty() {
      attach(&mut stack, &mut roots)?;
    }
    let root = if roots.len() == 1 {
      roots.remove(0)
    } else {
      Topic {
        title: name.clone(),
        notes: None,
        children: roots,
      }
    };
    sheets.push(Sheet { name, root });
  }
  Ok(Imported {
    workbook: workbook(sheets)?,
    warnings: Vec::new(),
  })
}

fn attach(stack: &mut Vec<(usize, Topic)>, roots: &mut Vec<Topic>) -> Result<(), String> {
  let (_, topic) = stack.pop().ok_or("纯文本大纲结构无效")?;
  if let Some((_, parent)) = stack.last_mut() {
    parent.children.push(topic);
  } else {
    roots.push(topic);
  }
  Ok(())
}
