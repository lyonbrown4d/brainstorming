use super::{Transfer, WindowSessions};
use serde_json::Value;

impl WindowSessions {
  pub async fn put_transfer(&self, token: String, transfer: Transfer) -> Result<(), String> {
    let mut registry = self.registry.lock().await;
    if !registry.windows.contains_key(&transfer.target) {
      return Err("目标窗口已关闭".into());
    }
    if registry
      .editors
      .get(&transfer.document_id)
      .is_none_or(|owner| owner != &transfer.source)
    {
      return Err("导图已不属于当前窗口".into());
    }
    if registry
      .transfers
      .values()
      .any(|pending| pending.document_id == transfer.document_id)
    {
      return Err("导图正在移交".into());
    }
    // Until the target acknowledges installation, the source retains every grant,
    // native history and its visible tab. Target failure cannot discard the document.
    registry.transfers.insert(token, transfer);
    Ok(())
  }
  pub async fn transfer(&self, target: &str) -> Option<(String, Value)> {
    let registry = self.registry.lock().await;
    registry
      .transfers
      .iter()
      .find(|(_, transfer)| transfer.target == target)
      .map(|(token, transfer)| (token.clone(), transfer.payload.clone()))
  }
  pub async fn accept_transfer(&self, target: &str, token: &str) -> Result<Transfer, String> {
    let mut registry = self.registry.lock().await;
    let pending = registry
      .transfers
      .get(token)
      .filter(|transfer| transfer.target == target)
      .ok_or("导图移交请求已失效")?;
    if !registry.windows.contains_key(&pending.source) || !registry.windows.contains_key(target) {
      return Err("导图移交窗口已关闭".into());
    }
    let transfer = registry
      .transfers
      .remove(token)
      .ok_or("导图移交请求已失效")?;
    registry
      .editors
      .insert(transfer.document_id.clone(), transfer.target.clone());
    for (owner, id) in registry.paths.values_mut() {
      if owner == &transfer.source && id == &transfer.document_id {
        *owner = transfer.target.clone();
      }
    }
    Ok(transfer)
  }
  pub async fn cancel_transfer(&self, token: &str) {
    if let Some(mut transfer) = self.registry.lock().await.transfers.remove(token)
      && let Some(completion) = transfer.completion.take()
    {
      let _ = completion.send(Err("目标窗口未接收导图，请重试".into()));
    }
  }
  pub async fn cancel_window_transfers(&self, window: &str) {
    let mut registry = self.registry.lock().await;
    let tokens = registry
      .transfers
      .iter()
      .filter(|(_, transfer)| transfer.source == window || transfer.target == window)
      .map(|(token, _)| token.clone())
      .collect::<Vec<_>>();
    for token in tokens {
      if let Some(mut transfer) = registry.transfers.remove(&token)
        && let Some(completion) = transfer.completion.take()
      {
        let _ = completion.send(Err("移交窗口已关闭，导图仍保留在原窗口".into()));
      }
    }
  }
}
