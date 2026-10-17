use super::{Result, error::invalid, schema};
use deadpool_sqlite::{Config, Hook, HookError, Pool, Runtime};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
};
use tokio::sync::{Mutex, OwnedMutexGuard};
use zeroize::Zeroizing;

#[derive(Default)]
struct Registry {
    entries: HashMap<PathBuf, Arc<Mutex<Entry>>>,
    closed: bool,
}
static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();

#[derive(Default)]
pub(crate) struct Entry {
    pools: HashMap<String, Pool>,
    pub references: usize,
}

pub(crate) fn canonical(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(invalid("文件路径为空"));
    }
    if path.exists() {
        return Ok(path.canonicalize()?);
    }
    let absolute = if path.is_absolute() {
        path.to_owned()
    } else {
        std::env::current_dir()?.join(path)
    };
    let name = absolute.file_name().ok_or_else(|| invalid("文件名无效"))?;
    let parent = absolute
        .parent()
        .ok_or_else(|| invalid("文件目录无效"))?
        .canonicalize()?;
    Ok(parent.join(name))
}

pub(crate) async fn lock(path: &Path) -> Result<(PathBuf, OwnedMutexGuard<Entry>)> {
    let path = path.to_owned();
    let canonical = tokio::task::spawn_blocking(move || canonical(&path))
        .await
        .map_err(|_| super::DocumentError::Worker)??;
    let gate = {
        let mut registry = REGISTRY.get_or_init(Default::default).lock().await;
        if registry.closed {
            return Err(invalid("原生文档服务已关闭"));
        }
        registry
            .entries
            .entry(canonical.clone())
            .or_default()
            .clone()
    };
    let entry = gate.lock_owned().await;
    // Shutdown can start while this caller is queued behind an active lease.
    if REGISTRY.get_or_init(Default::default).lock().await.closed {
        return Err(invalid("原生文档服务已关闭"));
    }
    Ok((canonical, entry))
}

impl Entry {
    pub async fn close(&mut self) -> Result<()> {
        let mut failure = None;
        for (_, pool) in self.pools.drain() {
            if pool.status().size > 0 {
                let closed = async {
                    let connection = pool.get().await.map_err(|_| super::DocumentError::Pool)?;
                    connection
                        .interact(|db| {
                            let placeholder = rusqlite::Connection::open_in_memory()?;
                            let original = std::mem::replace(db, placeholder);
                            original.close().map_err(|(_, error)| error)?;
                            Ok::<_, super::DocumentError>(())
                        })
                        .await
                        .map_err(|_| super::DocumentError::Worker)?
                }
                .await;
                if let Err(error) = closed {
                    failure = Some(error);
                }
            }
            pool.close();
        }
        match failure {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    pub async fn run<T, F>(
        &mut self,
        path: PathBuf,
        password: Option<&str>,
        create: bool,
        operation: F,
    ) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut rusqlite::Connection) -> Result<T> + Send + 'static,
    {
        if !create
            && !tokio::fs::metadata(&path)
                .await
                .is_ok_and(|metadata| metadata.is_file())
        {
            return Err(invalid("文档文件不存在"));
        }
        let password = Zeroizing::new(password.unwrap_or_default().to_owned());
        let (password, digest) = tokio::task::spawn_blocking(move || {
            let digest = hex::encode(Sha256::digest(password.as_bytes()));
            (password, digest)
        })
        .await
        .map_err(|_| super::DocumentError::Worker)?;
        let pool = if let Some(pool) = self.pools.get(&digest) {
            pool.clone()
        } else {
            // SQLite URI mode=rw prevents the standard manager's CREATE flag
            // from recreating a document removed between validation and open.
            let mut uri =
                url::Url::from_file_path(&path).map_err(|_| invalid("文档路径无法编码"))?;
            uri.query_pairs_mut().append_pair("mode", "rw");
            let filename = match uri.host_str() {
                Some(host) if host != "localhost" => {
                    format!("file:////{host}{}?mode=rw", uri.path())
                }
                _ => uri.to_string(),
            };
            let config = Config::new(filename);
            let manager = deadpool_sqlite::Manager::from_config(&config, Runtime::Tokio1);
            let pool = Pool::builder(manager)
                .post_create(Hook::async_fn(move |connection, _| {
                    let password = password.clone();
                    Box::pin(async move {
                        connection
                            .interact(move |db| {
                                schema::configure(db, Some(password.as_str()))?;
                                schema::initialize(db, create)
                            })
                            .await
                            .map_err(|_| HookError::message("数据库操作线程失败"))?
                            .map_err(|error| HookError::message(error.to_string()))
                    })
                }))
                .max_size(1)
                .build()
                .map_err(|_| super::DocumentError::Pool)?;
            self.pools.insert(digest.clone(), pool.clone());
            pool
        };
        let result = async {
            let conn = pool
                .get()
                .await
                .map_err(|error| invalid(error.to_string()))?;
            conn.interact(operation)
                .await
                .map_err(|_| super::DocumentError::Worker)?
        }
        .await;
        if result.is_err()
            && let Err(error) = self.close().await
        {
            tracing::warn!(error=%error,"Native document connection cleanup failed");
        }
        result
    }
}

pub(crate) async fn shutdown() -> Result<()> {
    let gates = {
        let mut registry = REGISTRY.get_or_init(Default::default).lock().await;
        registry.closed = true;
        registry.entries.values().cloned().collect::<Vec<_>>()
    };
    let mut failure = None;
    for gate in gates {
        if let Err(error) = gate.lock_owned().await.close().await {
            failure = Some(error);
        }
    }
    REGISTRY
        .get_or_init(Default::default)
        .lock()
        .await
        .entries
        .clear();
    match failure {
        Some(error) => Err(error),
        None => Ok(()),
    }
}
