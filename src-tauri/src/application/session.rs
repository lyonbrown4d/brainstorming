use crate::{document::DocumentStore, runtime::session::Session, storage::MetadataStore};
use std::sync::{Arc, RwLock};
use tokio::{sync::Mutex, task::JoinHandle};
use tokio_util::sync::CancellationToken;

pub(super) struct SessionService {
    pub session: Arc<Mutex<Session>>,
    pub recovery: Arc<Mutex<()>>,
    pub language: Arc<RwLock<String>>,
    stopped: CancellationToken,
    worker: Mutex<Option<JoinHandle<()>>>,
}
impl SessionService {
    pub async fn new(metadata: &MetadataStore) -> Result<Self, String> {
        let recent = metadata.recent_files().await.map_err(|e| e.to_string())?;
        let language = if let Some(value) = metadata.language().await.map_err(|e| e.to_string())? {
            value
        } else {
            let locale = tokio::task::spawn_blocking(tauri_plugin_os::locale)
                .await
                .map_err(|_| "无法读取系统语言")?
                .unwrap_or_default();
            if locale.to_lowercase().starts_with("zh") {
                "zh-CN".into()
            } else {
                "en".into()
            }
        };
        Ok(Self {
            session: Arc::new(Mutex::new(Session {
                recent,
                preserve_recovery: true,
                ..Default::default()
            })),
            recovery: Arc::new(Mutex::new(())),
            language: Arc::new(RwLock::new(language)),
            stopped: CancellationToken::new(),
            worker: Mutex::new(None),
        })
    }
    pub async fn start(&self) {
        let mut slot = self.worker.lock().await;
        if slot.is_some() {
            return;
        }
        let weak = Arc::downgrade(&self.session);
        let stopped = self.stopped.clone();
        *slot = Some(tokio::spawn(async move {
            loop {
                tokio::select! { biased;
                    _ = stopped.cancelled() => break,
                    _ = tokio::time::sleep(std::time::Duration::from_secs(15)) => {}
                }
                let Some(session) = weak.upgrade() else {
                    break;
                };
                session
                    .lock()
                    .await
                    .pending
                    .retain(|_, pending| pending.expires > std::time::Instant::now());
            }
        }));
    }
    pub async fn shutdown(&self, documents: &DocumentStore) -> Result<(), String> {
        self.stopped.cancel();
        let mut error = None;
        if let Some(worker) = self.worker.lock().await.take()
            && worker.await.is_err()
        {
            error = Some("会话后台任务关闭失败".to_string());
        }
        let _recovery = self.recovery.lock().await;
        let retained = {
            let mut session = self.session.lock().await;
            let retained = session.retained.drain().collect::<Vec<_>>();
            session.passwords.clear();
            session.pending.clear();
            session.sources.clear();
            session.authorized.clear();
            retained
        };
        for path in retained {
            if let Err(failure) = documents.release(path).await {
                error = Some(failure.to_string());
            }
        }
        error.map_or(Ok(()), Err)
    }
}
impl Drop for SessionService {
    fn drop(&mut self) {
        self.stopped.cancel();
    }
}
