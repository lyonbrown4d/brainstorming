use super::history::EngineSnapshot;
use serde_json::Value;
use std::collections::VecDeque;

const HISTORY_LIMIT: usize = 100;
const HISTORY_BYTES: usize = 32 * 1024 * 1024;
type Entry = (Value, usize);

pub(super) struct Session {
  pub revision: u64,
  pub workbook: Value,
  size: usize,
  past: VecDeque<Entry>,
  future: Vec<Entry>,
}

impl Session {
  pub fn new(workbook: Value) -> Result<Self, String> {
    let size = encoded_size(&workbook)?;
    Ok(Self {
      revision: 0,
      workbook,
      size,
      past: VecDeque::new(),
      future: Vec::new(),
    })
  }

  pub fn snapshot(&self, session_id: &str) -> EngineSnapshot {
    EngineSnapshot {
      session_id: session_id.to_owned(),
      revision: self.revision,
      workbook: self.workbook.clone(),
      can_undo: !self.past.is_empty(),
      can_redo: !self.future.is_empty(),
    }
  }

  pub fn commit(&mut self, candidate: Value) -> Result<(), String> {
    if candidate == self.workbook {
      return Ok(());
    }
    let next = self.revision.checked_add(1).ok_or("会话版本已耗尽")?;
    let size = encoded_size(&candidate)?;
    self
      .past
      .push_back((std::mem::replace(&mut self.workbook, candidate), self.size));
    self.size = size;
    self.future.clear();
    self.revision = next;
    self.trim_history(HISTORY_BYTES);
    Ok(())
  }

  pub fn undo(&mut self) -> Result<(), String> {
    if self.past.is_empty() {
      return Ok(());
    }
    let next = self.revision.checked_add(1).ok_or("会话版本已耗尽")?;
    let (previous, size) = self.past.pop_back().ok_or("撤销历史不存在")?;
    self
      .future
      .push((std::mem::replace(&mut self.workbook, previous), self.size));
    self.size = size;
    self.revision = next;
    self.trim_history(HISTORY_BYTES);
    Ok(())
  }

  pub fn redo(&mut self) -> Result<(), String> {
    if self.future.is_empty() {
      return Ok(());
    }
    let next = self.revision.checked_add(1).ok_or("会话版本已耗尽")?;
    let (next_workbook, size) = self.future.pop().ok_or("重做历史不存在")?;
    self.past.push_back((
      std::mem::replace(&mut self.workbook, next_workbook),
      self.size,
    ));
    self.size = size;
    self.revision = next;
    self.trim_history(HISTORY_BYTES);
    Ok(())
  }

  fn trim_history(&mut self, budget: usize) {
    let mut bytes: usize = self
      .past
      .iter()
      .chain(&self.future)
      .map(|(_, size)| size)
      .sum();
    while bytes > budget || self.past.len() + self.future.len() > HISTORY_LIMIT {
      // Keep the immediate undo/redo even when one large snapshot exceeds the budget.
      let removed = if self.past.len() > 1 {
        self.past.pop_front()
      } else if self.future.len() > 1 {
        Some(self.future.remove(0))
      } else {
        None
      };
      let Some((_, size)) = removed else {
        break;
      };
      bytes -= size;
    }
  }
}

fn encoded_size(value: &Value) -> Result<usize, String> {
  serde_json::to_vec(value)
    .map(|bytes| bytes.len())
    .map_err(|_| "历史快照无效".into())
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn byte_budget_trims_oldest_history_and_keeps_immediate_travel() {
    let a = json!({"value":"a".repeat(64)});
    let b = json!({"value":"b".repeat(64)});
    let c = json!({"value":"c".repeat(64)});
    let mut session = Session::new(a).unwrap();
    session.commit(b.clone()).unwrap();
    session.commit(c.clone()).unwrap();
    session.trim_history(1);
    assert_eq!(session.past.len(), 1);
    session.undo().unwrap();
    assert_eq!(session.workbook, b);
    assert!(session.past.is_empty());
    session.redo().unwrap();
    assert_eq!(session.workbook, c);
  }
}
