use super::{Result, SyncContentIndex};
use std::collections::{HashMap, HashSet};
use unicode_segmentation::UnicodeSegmentation;

pub(super) const MAX_TEXT: usize = 128 * 1024 * 1024;
pub(super) const MAX_TOPICS: usize = 100_000;
pub(super) fn identifier(value: &str) -> Result<()> {
  if value.trim().is_empty() || value.len() > 4096 || value.contains('\0') {
    return Err("搜索内容标识无效".into());
  }
  Ok(())
}
fn text(value: &str, limit: usize) -> Result<()> {
  if value.contains('\0') || value.encode_utf16().count() > limit {
    return Err("搜索内容文本超过限制或包含无效字符".into());
  }
  Ok(())
}
/// Validate the entire batch before taking a database transaction or mutating rows.
pub(super) fn validate(input: &SyncContentIndex) -> Result<Vec<(usize, usize)>> {
  if input.retained_workbook_ids.len() > 32 || input.upserts.len() > 32 {
    return Err("搜索工作簿超过 32 份限制".into());
  }
  let mut retained = HashSet::new();
  for id in &input.retained_workbook_ids {
    identifier(id)?;
    if !retained.insert(id.as_str()) {
      return Err("搜索工作簿标识重复".into());
    }
  }
  let mut upserts = HashSet::new();
  let mut totals = Vec::with_capacity(input.upserts.len());
  let (mut bytes, mut count) = (0, 0);
  for workbook in &input.upserts {
    identifier(&workbook.workbook_id)?;
    text(&workbook.title, 2_048_000)?;
    if !retained.contains(workbook.workbook_id.as_str())
      || !upserts.insert(workbook.workbook_id.as_str())
      || workbook.topics.len() > 20_000
    {
      return Err("搜索工作簿范围、标识或主题数量无效".into());
    }
    let mut identities = HashSet::new();
    let mut sheets = HashMap::new();
    let mut workbook_bytes = workbook.workbook_id.len() + workbook.title.len();
    for topic in &workbook.topics {
      identifier(&topic.sheet_id)?;
      identifier(&topic.topic_id)?;
      text(&topic.sheet_name, 4096)?;
      if topic.sheet_name.trim().is_empty() || topic.sheet_name.graphemes(true).count() > 80 {
        return Err("搜索画布名称须为 1 至 80 个字符".into());
      }
      text(&topic.title, 2_048_000)?;
      text(&topic.notes, 100_000)?;
      if !identities.insert((&topic.sheet_id, &topic.topic_id)) {
        return Err("搜索主题标识重复".into());
      }
      if let Some(previous) = sheets.insert(&topic.sheet_id, &topic.sheet_name)
        && previous != &topic.sheet_name
      {
        return Err("搜索画布名称不一致".into());
      }
      workbook_bytes += topic.sheet_id.len()
        + topic.sheet_name.len()
        + topic.topic_id.len()
        + topic.title.len()
        + topic.notes.len();
      if bytes + workbook_bytes > MAX_TEXT {
        return Err("搜索索引超过 128 MiB 文本限制".into());
      }
    }
    if sheets.len() > 128 {
      return Err("搜索画布超过 128 个限制".into());
    }
    bytes += workbook_bytes;
    count += workbook.topics.len();
    totals.push((workbook_bytes, workbook.topics.len()));
    if bytes > MAX_TEXT || count > MAX_TOPICS {
      return Err("搜索索引超过 128 MiB 或 100000 个主题限制".into());
    }
  }
  Ok(totals)
}
