use super::{ai::AIService, input::Result, mcp::MCPService, session::Session};
use crate::{
    document::DocumentStore,
    storage::{MetadataStore, ResourceVault},
};
use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tokio::sync::Mutex;

pub struct AppState {
    #[cfg(feature = "e2e")]
    pub test_dialogs: tokio::sync::Mutex<std::collections::VecDeque<(String, Option<PathBuf>)>>,
    pub directory: PathBuf,
    pub documents: Arc<DocumentStore>,
    pub metadata: Arc<MetadataStore>,
    pub vault: Arc<ResourceVault>,
    pub session: Arc<Mutex<Session>>,
    pub recovery: Mutex<()>,
    pub ai: AIService,
    pub mcp: MCPService,
    pub language: RwLock<String>,
    pub resource_origin: RwLock<String>,
}
impl AppState {
    pub async fn new(directory: PathBuf) -> Result<Self> {
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(|_| "无法创建应用存储目录")?;
        let metadata = Arc::new(
            MetadataStore::new(directory.join("brainstorming-native-v2.sqlite"))
                .await
                .map_err(|e| e.to_string())?,
        );
        let recent = metadata.recent_files().await.map_err(|e| e.to_string())?;
        let language =
            if let Some(language) = metadata.language().await.map_err(|e| e.to_string())? {
                language
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
        let vault = Arc::new(
            ResourceVault::new(directory.join("resource-vault"))
                .await
                .map_err(|e| e.to_string())?,
        );
        let session = Arc::new(Mutex::new(Session {
            recent,
            preserve_recovery: true,
            ..Default::default()
        }));
        let weak_session = Arc::downgrade(&session);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                let Some(session) = weak_session.upgrade() else {
                    break;
                };
                session
                    .lock()
                    .await
                    .pending
                    .retain(|_, pending| pending.expires > std::time::Instant::now());
            }
        });
        Ok(Self {
            #[cfg(feature = "e2e")]
            test_dialogs: tokio::sync::Mutex::new(Default::default()),
            ai: AIService::new(directory.clone()),
            mcp: MCPService::default(),
            documents: Arc::new(DocumentStore::new()),
            metadata,
            vault,
            session,
            recovery: Mutex::new(()),
            directory,
            language: RwLock::new(language),
            resource_origin: RwLock::new("http://brainstorming.localhost".into()),
        })
    }
    pub fn set_resource_origin(&self, value: String) {
        if let Ok(mut origin) = self.resource_origin.write() {
            *origin = value;
        }
    }
}
