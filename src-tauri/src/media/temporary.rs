use super::Result;
use std::path::{Path, PathBuf};
use tempfile::TempDir;
/// Owns a private generated directory. Error/cancellation drops schedule cleanup
/// on a blocking worker; normal completion explicitly awaits close().
pub(super) struct Directory(Option<TempDir>);
impl Directory {
  pub fn wrap(directory: TempDir) -> Self {
    Self(Some(directory))
  }
  pub async fn create(parent: PathBuf, prefix: &'static str) -> Result<Self> {
    let directory = tokio::task::spawn_blocking(move || {
      tempfile::Builder::new().prefix(prefix).tempdir_in(parent)
    })
    .await
    .map_err(|_| "临时目录任务失败")?
    .map_err(|_| "无法创建媒体临时目录")?;
    Ok(Self::wrap(directory))
  }
  pub fn path(&self) -> &Path {
    self.0.as_ref().expect("owned temporary directory").path()
  }
  pub async fn close(mut self) -> Result<()> {
    if let Some(directory) = self.0.take() {
      tokio::task::spawn_blocking(move || directory.close())
        .await
        .map_err(|_| "临时目录清理任务失败")?
        .map_err(|_| "无法清理媒体临时目录")?;
    }
    Ok(())
  }
}
impl Drop for Directory {
  fn drop(&mut self) {
    let Some(directory) = self.0.take() else {
      return;
    };
    if let Ok(runtime) = tokio::runtime::Handle::try_current() {
      runtime.spawn_blocking(move || drop(directory));
    } else {
      std::thread::spawn(move || drop(directory));
    }
  }
}
