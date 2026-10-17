use super::{Result, error::invalid, schema};
use futures_util::future::BoxFuture;
use sha2::{Digest, Sha256};
use sqlx::{SqliteConnection, SqlitePool, sqlite::SqlitePoolOptions};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::{Mutex, OwnedMutexGuard};
use zeroize::Zeroizing;

#[derive(Default)]
struct RegistryState {
    entries: HashMap<PathBuf, Arc<Mutex<Entry>>>,
    closed: bool,
}
#[derive(Default)]
pub(crate) struct Registry {
    state: Mutex<RegistryState>,
}

#[derive(Default)]
pub(crate) struct Entry {
    pools: HashMap<String, SqlitePool>,
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

impl Registry {
    pub(crate) async fn lock(&self, path: &Path) -> Result<(PathBuf, OwnedMutexGuard<Entry>)> {
        let path = path.to_owned();
        let canonical = tokio::task::spawn_blocking(move || canonical(&path))
            .await
            .map_err(|_| super::DocumentError::Worker)??;
        let gate = {
            let mut registry = self.state.lock().await;
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
        if self.state.lock().await.closed {
            return Err(invalid("原生文档服务已关闭"));
        }
        Ok((canonical, entry))
    }

    pub(crate) async fn shutdown(&self) -> Result<()> {
        let gates = {
            let mut registry = self.state.lock().await;
            registry.closed = true;
            registry.entries.values().cloned().collect::<Vec<_>>()
        };
        let mut failure = None;
        for gate in gates {
            if let Err(error) = gate.lock_owned().await.close().await {
                failure = Some(error);
            }
        }
        self.state.lock().await.entries.clear();
        match failure {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}

impl Entry {
    pub async fn close(&mut self) -> Result<()> {
        for (_, pool) in self.pools.drain() {
            pool.close().await;
        }
        Ok(())
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
        F: for<'a> FnOnce(&'a mut SqliteConnection) -> BoxFuture<'a, Result<T>>,
    {
        if !create
            && !tokio::fs::metadata(&path)
                .await
                .is_ok_and(|item| item.is_file())
        {
            return Err(invalid("文档文件不存在"));
        }
        let password = Zeroizing::new(password.unwrap_or_default().to_owned());
        let digest = hex::encode(Sha256::digest(password.as_bytes()));
        let pool = if let Some(pool) = self.pools.get(&digest) {
            pool.clone()
        } else {
            let options = schema::options(&path, Some(password.as_str()), create, false)?;
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .after_connect(|db, _| {
                    Box::pin(async move {
                        schema::authenticate(db)
                            .await
                            .map_err(|_| sqlx::Error::Protocol("文档数据库连接认证失败".into()))
                    })
                })
                .connect_with(options)
                .await?;
            let initialized = async {
                let mut db = pool.acquire().await?;
                schema::initialize(&mut db, create).await
            }
            .await;
            if let Err(error) = initialized {
                pool.close().await;
                return Err(error);
            }
            self.pools.insert(digest, pool.clone());
            pool
        };
        let result = async {
            let mut db = pool.acquire().await?;
            operation(&mut db).await
        }
        .await;
        if result.is_err() {
            self.close().await?;
        }
        result
    }
}
