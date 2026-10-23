use super::{
  Importer, Result, network,
  preview_state::{self, CAPACITY, Job, Outcome, QueueState},
  snapshot,
};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter};
use tauri_plugin_brainstorming_native::NativeBridgeExt;
use tokio::sync::{Mutex, mpsc, watch};
use tokio_util::sync::CancellationToken;
pub struct PreviewQueue {
  app: AppHandle,
  importer: Arc<Importer>,
  state: Mutex<QueueState>,
  sender: mpsc::Sender<Job>,
  cancellation: CancellationToken,
  worker: Mutex<Option<tokio::task::JoinHandle<()>>>,
}
impl PreviewQueue {
  pub async fn new(app: AppHandle, importer: Arc<Importer>) -> Result<Arc<Self>> {
    let (sender, mut receiver) = mpsc::channel::<Job>(CAPACITY);
    let queue = Arc::new(Self {
      app,
      importer,
      state: Mutex::new(QueueState::default()),
      sender,
      cancellation: CancellationToken::new(),
      worker: Mutex::new(None),
    });
    let weak = Arc::downgrade(&queue);
    let stopped = queue.cancellation.clone();
    let task = tokio::spawn(async move {
      loop {
        let job = tokio::select! { biased; _=stopped.cancelled()=>break,job=receiver.recv()=>match job { Some(job)=>job,None=>break } };
        let Some(queue) = weak.upgrade() else {
          break;
        };
        let outcome = if job.cancel.is_cancelled() {
          Err("网页预览已取消".into())
        } else {
          queue.capture(&job).await
        };
        let mut state = queue.state.lock().await;
        state.pending.remove(&job.url);
        if !job.cancel.is_cancelled() && !stopped.is_cancelled() {
          if let Ok(asset) = &outcome {
            state.cache.insert(job.url.clone(), asset.clone());
            state.order.push_back(job.url.clone());
            while state.order.len() > CAPACITY {
              if let Some(url) = state.order.pop_front() {
                state.cache.remove(&url);
              }
            }
          } else {
            state.failures.insert(job.url.clone());
            if state.failures.len() > CAPACITY
              && let Some(url) = state.failures.iter().next().cloned()
            {
              state.failures.remove(&url);
            }
          }
        }
        let _ = job.result.send(Some(outcome));
        let _ = queue.app.emit_to(
          &queue.importer.state.window_id,
          "native:link-preview",
          &job.url,
        );
        let desired: Vec<_> = state
          .desired
          .iter()
          .filter(|url| !state.failures.contains(*url))
          .cloned()
          .collect();
        for url in desired {
          let _ = queue.enqueue(&mut state, url, false);
        }
      }
      while let Ok(job) = receiver.try_recv() {
        let _ = job.result.send(Some(Err("网页预览服务已关闭".into())));
      }
    });
    *queue.worker.lock().await = Some(task);
    Ok(queue)
  }
  fn enqueue(
    &self,
    state: &mut QueueState,
    url: String,
    manual: bool,
  ) -> Result<watch::Receiver<Option<Outcome>>> {
    preview_state::enqueue(&self.sender, &self.cancellation, state, url, manual)
  }
  pub async fn set_urls(&self, urls: Vec<String>) -> Result<()> {
    let mut state = self.state.lock().await;
    preview_state::set_desired(&mut state, urls);
    let desired: Vec<_> = state
      .desired
      .iter()
      .filter(|url| !state.failures.contains(*url))
      .cloned()
      .collect();
    for url in desired {
      let _ = self.enqueue(&mut state, url, false);
    }
    Ok(())
  }
  pub async fn get(&self, url: &str) -> Result<Value> {
    let url = network::normalize(url)?;
    let state = self.state.lock().await;
    if state.failures.contains(&url) {
      return Err("网页静态预览无法生成".into());
    }
    Ok(state.cache.get(&url).cloned().unwrap_or(Value::Null))
  }
  pub async fn generate(&self, url: &str) -> Result<Value> {
    let url = network::normalize(url)?;
    let mut receiver = {
      let mut state = self.state.lock().await;
      self.enqueue(&mut state, url, true)?
    };
    loop {
      if let Some(outcome) = receiver.borrow().clone() {
        return outcome;
      }
      tokio::select! { biased; _=self.cancellation.cancelled()=>return Err("网页预览服务已关闭".into()),
      result=receiver.changed()=>result.map_err(|_|"网页预览任务已关闭")? }
    }
  }
  async fn capture(&self, job: &Job) -> Outcome {
    let directory =
      super::temporary::Directory::create(self.importer.state.directory.clone(), "link-preview-")
        .await?;
    let path = directory.path().join("preview.png");
    let operation_cancel = job.cancel.child_token();
    let mut import_task: Option<tokio::task::JoinHandle<Outcome>> = None;
    let work = async {
      let html = snapshot::prepare(&job.url, &job.cancel).await?;
      if html.len() > 4 * 1024 * 1024 {
        return Err("网页静态内容展开后超过 4 MiB，无法生成预览".into());
      }
      self
        .app
        .native_bridge()
        .call(
          "captureLinkPreview",
          json!({"id":job.id,"html":html,"baseURL":job.url,"outputPath":path}),
        )
        .await?;
      if job.cancel.is_cancelled() {
        return Err("网页预览已取消".into());
      }
      let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|_| "原生截图未生成图片")?;
      if metadata.len() == 0 || metadata.len() > 16 * 1024 * 1024 {
        return Err("原生截图大小无效".into());
      }
      let importer = self.importer.clone();
      let import_path = path.clone();
      let import_cancel = operation_cancel.clone();
      import_task = Some(tokio::spawn(async move {
        importer
          .file_with_cancel(&import_path, "image", import_cancel)
          .await
      }));
      let result = import_task.as_mut().expect("import task started").await;
      import_task.take();
      result.map_err(|_| "网页预览导入任务失败")?
    };
    let result = tokio::select! { biased;
        _=job.cancel.cancelled()=>Err("网页预览已取消".into()),
        result=tokio::time::timeout(Duration::from_secs(40),work)=>result.unwrap_or_else(|_|Err("网页静态预览生成超时".into())),
    };
    operation_cancel.cancel();
    // A dropped spawn_blocking future cannot stop a native writer. Join
    // the import task after cancellation so disposal waits for its cleanup.
    if let Some(task) = import_task.take() {
      let _ = task.await;
    }
    // Await native cancellation before deleting outputs. This prevents a
    // late platform writer from recreating a plaintext screenshot directory.
    let _ = self
      .app
      .native_bridge()
      .call("cancelLinkPreview", json!({"id":job.id}))
      .await;
    directory.close().await?;
    result
  }
  pub fn revoke(&self) {
    self.cancellation.cancel();
  }
  pub async fn shutdown(&self) {
    self.revoke();
    if let Some(task) = self.worker.lock().await.take() {
      let _ = task.await;
    }
    let mut state = self.state.lock().await;
    state.pending.clear();
    state.cache.clear();
    state.desired.clear();
  }
}
impl Drop for PreviewQueue {
  fn drop(&mut self) {
    self.cancellation.cancel();
  }
}
