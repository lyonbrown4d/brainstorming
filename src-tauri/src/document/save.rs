use super::{
    DocumentError, DocumentStore, ResourceSource, Result, creation, key_change, pool, validation,
    write,
};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::OwnedMutexGuard;
use zeroize::Zeroizing;

impl DocumentStore {
    pub async fn write(
        &self,
        path: impl AsRef<Path>,
        workbook: Value,
        password: Option<&str>,
        existing_password: Option<&str>,
        source: Option<Arc<dyn ResourceSource>>,
    ) -> Result<Value> {
        let path = path.as_ref().to_owned();
        let password = Zeroizing::new(password.unwrap_or_default().to_owned());
        let previous = Zeroizing::new(existing_password.unwrap_or_default().to_owned());
        let workbook = tokio::task::spawn_blocking(move || {
            validation::validate_workbook(&workbook)?;
            Ok::<_, DocumentError>(workbook)
        })
        .await
        .map_err(|_| DocumentError::Worker)??;
        let (path, entry) = self.registry.lock(&path).await?;
        // Validation and queued requests remain cancellable before I/O starts.
        // Keep the gate, connections and temporary files owned by the operation
        // if the caller drops its IPC future; async native close must complete.
        tokio::spawn(async move {
            write_owned(path, entry, workbook, &password, &previous, source).await
        })
        .await
        .map_err(|_| DocumentError::Worker)?
    }
    pub async fn rekey(
        &self,
        path: impl AsRef<Path>,
        previous: Option<&str>,
        password: Option<&str>,
    ) -> Result<()> {
        let path = path.as_ref().to_owned();
        let previous = Zeroizing::new(previous.unwrap_or_default().to_owned());
        let password = Zeroizing::new(password.unwrap_or_default().to_owned());
        let (path, mut entry) = self.registry.lock(&path).await?;
        tokio::spawn(async move {
            if previous.as_str() == password.as_str() {
                return entry
                    .run(path, Some(&previous), false, |db| {
                        Box::pin(async move { super::structure::read(db).await.map(|_| ()) })
                    })
                    .await;
            }
            key_change::replace(
                &mut entry,
                path,
                Some(&previous),
                Some(&password),
                None,
                None,
            )
            .await?;
            Ok(())
        })
        .await
        .map_err(|_| DocumentError::Worker)?
    }
}

async fn write_owned(
    path: PathBuf,
    mut entry: OwnedMutexGuard<pool::Entry>,
    workbook: Value,
    password: &str,
    previous: &str,
    source: Option<Arc<dyn ResourceSource>>,
) -> Result<Value> {
    if !tokio::fs::try_exists(&path).await? {
        entry.close().await?;
        return creation::write_new(path, Some(password), workbook, source).await;
    }
    if password != previous {
        return key_change::replace(
            &mut entry,
            path,
            Some(previous),
            Some(password),
            Some(workbook),
            source,
        )
        .await?
        .ok_or_else(|| super::error::invalid("密码变更缺少工作簿"));
    }
    entry
        .run(path, Some(password), false, move |db| {
            Box::pin(async move { write::write(db, workbook, source.as_deref()).await })
        })
        .await
}
