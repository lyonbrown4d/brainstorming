#[path = "window_transfer_state.rs"]
mod transfer_state;
use super::{AppState, session::Session};
use crate::search::SearchService;
use serde_json::Value;
use std::{
  collections::HashMap,
  path::PathBuf,
  sync::{Arc, RwLock},
};
use tokio::sync::Mutex;

#[derive(Clone)]
pub(crate) struct WindowSession {
  pub session: Arc<Mutex<Session>>,
  pub search: Arc<SearchService>,
  pub mcp: Arc<super::mcp::MCPService>,
  pub resource_origin: Arc<RwLock<String>>,
}
pub(crate) struct Transfer {
  pub source: String,
  pub target: String,
  pub document_id: String,
  pub payload: Value,
  pub completion: Option<tokio::sync::oneshot::Sender<Result<(), String>>>,
}
#[derive(Default)]
struct Registry {
  windows: HashMap<String, WindowSession>,
  editors: HashMap<String, String>,
  paths: HashMap<PathBuf, (String, String)>,
  pub transfers: HashMap<String, Transfer>,
  recovery_claimed: bool,
}
pub struct WindowSessions {
  registry: Mutex<Registry>,
  pub handoff: Mutex<()>,
  pub quitting: std::sync::atomic::AtomicBool,
}
impl WindowSessions {
  pub fn new(
    session: Arc<Mutex<Session>>,
    search: Arc<SearchService>,
    mcp: Arc<super::mcp::MCPService>,
    origin: Arc<RwLock<String>>,
  ) -> Self {
    let main = WindowSession {
      session,
      search,
      mcp,
      resource_origin: origin,
    };
    Self {
      registry: Mutex::new(Registry {
        windows: HashMap::from([("main".into(), main)]),
        ..Default::default()
      }),
      handoff: Mutex::new(()),
      quitting: std::sync::atomic::AtomicBool::new(false),
    }
  }
  pub async fn get(&self, label: &str) -> Result<WindowSession, String> {
    self
      .registry
      .lock()
      .await
      .windows
      .get(label)
      .cloned()
      .ok_or_else(|| "应用窗口不可用".into())
  }
  pub async fn register(&self, label: &str, recent: Vec<String>) -> Result<(), String> {
    let search = Arc::new(SearchService::new().await?);
    let mut registry = self.registry.lock().await;
    if registry.windows.len() >= 16 {
      return Err("最多同时打开 16 个窗口".into());
    }
    registry.windows.insert(
      label.into(),
      WindowSession {
        session: Arc::new(Mutex::new(Session {
          recent,
          preserve_recovery: true,
          ..Default::default()
        })),
        search,
        mcp: Arc::new(super::mcp::MCPService::with_window(label)),
        resource_origin: Arc::new(RwLock::new(String::new())),
      },
    );
    Ok(())
  }
  pub fn try_close_allowed(&self, label: &str) -> Option<bool> {
    let registry = self.registry.try_lock().ok()?;
    Some(
      registry
        .windows
        .get(label)?
        .session
        .try_lock()
        .ok()?
        .close_allowed,
    )
  }
  pub async fn contains(&self, label: &str) -> bool {
    self.registry.lock().await.windows.contains_key(label)
  }
  pub async fn labels(&self) -> Vec<String> {
    self.registry.lock().await.windows.keys().cloned().collect()
  }
  pub async fn claim_editor(&self, window: &str, id: &str) -> Result<(), String> {
    let mut registry = self.registry.lock().await;
    if registry
      .transfers
      .values()
      .any(|transfer| transfer.document_id == id)
    {
      return Err("导图正在移交，请稍候".into());
    }
    if registry
      .editors
      .get(id)
      .is_some_and(|owner| owner != window)
    {
      return Err("导图已在其他窗口打开".into());
    }
    if !registry.editors.contains_key(id) && registry.editors.len() >= 32 {
      return Err("最多同时打开 32 份导图".into());
    }
    registry.editors.insert(id.into(), window.into());
    Ok(())
  }
  pub async fn assert_editor(&self, window: &str, id: &str) -> Result<(), String> {
    let registry = self.registry.lock().await;
    if registry
      .transfers
      .values()
      .any(|transfer| transfer.document_id == id)
    {
      return Err("导图正在移交，请稍候".into());
    }
    if registry
      .editors
      .get(id)
      .is_some_and(|owner| owner == window)
    {
      Ok(())
    } else {
      Err("此窗口无权编辑该导图".into())
    }
  }
  pub async fn release_editor(&self, window: &str, id: &str) -> bool {
    let mut registry = self.registry.lock().await;
    if registry
      .transfers
      .values()
      .any(|transfer| transfer.document_id == id)
    {
      return false;
    }
    if registry
      .editors
      .get(id)
      .is_some_and(|owner| owner == window)
    {
      registry.editors.remove(id);
      true
    } else {
      false
    }
  }
  pub async fn release_paths_for_reload(&self, window: &str) {
    let mut registry = self.registry.lock().await;
    let pending = registry
      .transfers
      .values()
      .filter(|transfer| transfer.target == window || transfer.source == window)
      .map(|transfer| transfer.document_id.clone())
      .collect::<Vec<_>>();
    registry
      .paths
      .retain(|_, (owner, id)| owner != window || pending.contains(id));
  }
  pub async fn release_editors_for_reload(&self, window: &str) -> Vec<String> {
    let mut registry = self.registry.lock().await;
    let ids = registry
      .editors
      .iter()
      .filter(|(id, owner)| {
        owner.as_str() == window
          && !registry.transfers.values().any(|transfer| {
            &transfer.document_id == *id && (transfer.target == window || transfer.source == window)
          })
      })
      .map(|(id, _)| id.clone())
      .collect::<Vec<_>>();
    for id in &ids {
      registry.editors.remove(id);
    }
    ids
  }
  pub async fn release_editors(&self, window: &str) -> Vec<String> {
    let mut registry = self.registry.lock().await;
    let ids = registry
      .editors
      .iter()
      .filter(|(_, owner)| owner.as_str() == window)
      .map(|(id, _)| id.clone())
      .collect::<Vec<_>>();
    for id in &ids {
      registry.editors.remove(id);
    }
    ids
  }
  pub async fn path_owner(&self, path: &std::path::Path) -> Option<(String, String)> {
    self.registry.lock().await.paths.get(path).cloned()
  }
  pub async fn claim_path(&self, path: PathBuf, window: &str, id: &str) -> Result<(), String> {
    let mut registry = self.registry.lock().await;
    if registry
      .paths
      .get(&path)
      .is_some_and(|(owner, document)| owner != window || document != id)
    {
      return Err("目标文件已在其他导图标签或窗口中打开".into());
    }
    registry.paths.insert(path, (window.into(), id.into()));
    Ok(())
  }
  pub async fn release_path(&self, window: &str, path: &std::path::Path) {
    let mut registry = self.registry.lock().await;
    if registry
      .paths
      .get(path)
      .is_some_and(|(owner, _)| owner == window)
    {
      registry.paths.remove(path);
    }
  }
  pub async fn claim_recovery(&self) -> bool {
    let mut registry = self.registry.lock().await;
    if registry.recovery_claimed {
      false
    } else {
      registry.recovery_claimed = true;
      true
    }
  }
  pub async fn remove(&self, label: &str) -> Option<WindowSession> {
    self.cancel_window_transfers(label).await;
    let mut registry = self.registry.lock().await;
    registry.paths.retain(|_, (owner, _)| owner != label);

    registry.windows.remove(label)
  }
  pub async fn shutdown(&self, state: &AppState) {
    let _handoff = self.handoff.lock().await;
    for label in self.labels().await {
      if let Ok(slot) = self.get(&label).await {
        slot.mcp.shutdown().await;
        slot.search.shutdown().await;
        let paths = {
          let mut session = slot.session.lock().await;
          session.passwords.clear();
          session.pending.clear();
          session.sources.clear();
          session.retained.drain().collect::<Vec<_>>()
        };
        for path in paths {
          let _ = state.documents.release(path).await;
        }
      }
    }
  }
}
