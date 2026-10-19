use super::Result;
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;
pub(super) const CAPACITY: usize = 1000;
pub(super) type Outcome = Result<Value>;
pub(super) struct Pending {
  pub cancel: CancellationToken,
  pub manual: bool,
  pub result: watch::Receiver<Option<Outcome>>,
}
pub(super) struct Job {
  pub url: String,
  pub id: String,
  pub cancel: CancellationToken,
  pub result: watch::Sender<Option<Outcome>>,
}
#[derive(Default)]
pub(super) struct QueueState {
  pub pending: HashMap<String, Pending>,
  pub desired: HashSet<String>,
  pub cache: HashMap<String, Value>,
  pub order: VecDeque<String>,
  pub failures: HashSet<String>,
}
pub(super) fn enqueue(
  sender: &mpsc::Sender<Job>,
  cancellation: &CancellationToken,
  state: &mut QueueState,
  url: String,
  manual: bool,
) -> Result<watch::Receiver<Option<Outcome>>> {
  if cancellation.is_cancelled() {
    return Err("网页预览服务已关闭".into());
  }
  if let Some(asset) = state.cache.get(&url) {
    let (_, receiver) = watch::channel(Some(Ok(asset.clone())));
    return Ok(receiver);
  }
  if let Some(pending) = state.pending.get_mut(&url) {
    pending.manual |= manual;
    return Ok(pending.result.clone());
  }
  if state.pending.len() >= CAPACITY {
    return Err("网页预览队列已满".into());
  }
  state.failures.remove(&url);
  let cancel = cancellation.child_token();
  let id = uuid::Uuid::new_v4().to_string();
  let (send, receiver) = watch::channel(None);
  sender
    .try_send(Job {
      url: url.clone(),
      id,
      cancel: cancel.clone(),
      result: send,
    })
    .map_err(|_| "网页预览队列已满")?;
  state.pending.insert(
    url,
    Pending {
      cancel,
      manual,
      result: receiver.clone(),
    },
  );
  Ok(receiver)
}
pub(super) fn set_desired(state: &mut QueueState, urls: Vec<String>) {
  state.desired = urls.into_iter().take(CAPACITY).collect();
  for (url, pending) in &state.pending {
    if !pending.manual && !state.desired.contains(url) {
      pending.cancel.cancel();
    }
  }
}
#[cfg(test)]
mod tests {
  use super::*;
  #[tokio::test]
  async fn duplicate_jobs_share_outcome_and_manual_requests_survive_removed_links() {
    let (sender, mut jobs) = mpsc::channel(CAPACITY);
    let cancel = CancellationToken::new();
    let mut state = QueueState::default();
    let url = "https://example.com/".to_string();
    let a = enqueue(&sender, &cancel, &mut state, url.clone(), false).unwrap();
    let b = enqueue(&sender, &cancel, &mut state, url.clone(), true).unwrap();
    assert_eq!(state.pending.len(), 1);
    let job = jobs.try_recv().unwrap();
    assert!(jobs.try_recv().is_err());
    set_desired(&mut state, vec![]);
    assert!(!job.cancel.is_cancelled());
    job
      .result
      .send(Some(Ok(serde_json::json!({"id":"asset"}))))
      .unwrap();
    assert_eq!(
      a.borrow().as_ref().unwrap().as_ref().unwrap()["id"],
      "asset"
    );
    assert_eq!(*a.borrow(), *b.borrow());
    let other = "https://example.org/".to_string();
    enqueue(&sender, &cancel, &mut state, other.clone(), false).unwrap();
    set_desired(&mut state, vec![url]);
    assert!(state.pending[&other].cancel.is_cancelled());
    cancel.cancel();
    assert!(job.cancel.is_cancelled());
  }
  #[tokio::test]
  async fn queue_and_ready_cache_bound_new_work() {
    let (sender, _jobs) = mpsc::channel(CAPACITY);
    let cancel = CancellationToken::new();
    let mut state = QueueState::default();
    for i in 0..CAPACITY {
      enqueue(
        &sender,
        &cancel,
        &mut state,
        format!("https://example.com/{i}"),
        false,
      )
      .unwrap();
    }
    assert!(
      enqueue(
        &sender,
        &cancel,
        &mut state,
        "https://example.com/overflow".into(),
        true
      )
      .is_err()
    );
    state.cache.insert(
      "https://cached.example/".into(),
      serde_json::json!({"id":"cached"}),
    );
    let cached = enqueue(
      &sender,
      &cancel,
      &mut state,
      "https://cached.example/".into(),
      true,
    )
    .unwrap();
    assert_eq!(
      cached.borrow().as_ref().unwrap().as_ref().unwrap()["id"],
      "cached"
    );
    assert_eq!(state.pending.len(), CAPACITY);
  }
}
