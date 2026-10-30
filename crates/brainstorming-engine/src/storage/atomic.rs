type Result<T> = std::result::Result<T, String>;
use std::{
  fs::{self, OpenOptions},
  io::Write,
  path::Path,
};

/// Write to a sibling temporary file and durably replace only after the write succeeds.
fn write_blocking(path: &Path, bytes: &[u8], overwrite: bool) -> Result<()> {
  let directory = path.parent().ok_or("文件路径无效")?;
  fs::create_dir_all(directory).map_err(|_| "无法创建存储目录")?;
  let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|_| "无法创建临时文件")?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    file
      .as_file()
      .set_permissions(fs::Permissions::from_mode(0o600))
      .map_err(|_| "无法保护文件权限")?;
  }
  file.write_all(bytes).map_err(|_| "文件写入失败")?;
  file.as_file().sync_all().map_err(|_| "文件同步失败")?;
  if overwrite {
    file.persist(path).map_err(|_| "无法替换目标文件")?;
  } else {
    file
      .persist_noclobber(path)
      .map_err(|_| "目标文件已存在或无法写入")?;
  }
  if let Ok(dir) = OpenOptions::new().read(true).open(directory) {
    let _ = dir.sync_all();
  }
  Ok(())
}

fn copy_blocking(source: &Path, destination: &Path) -> Result<()> {
  let directory = destination.parent().ok_or("文件路径无效")?;
  fs::create_dir_all(directory).map_err(|_| "无法创建存储目录")?;
  let mut output = tempfile::NamedTempFile::new_in(directory).map_err(|_| "无法创建临时文件")?;
  let mut input = std::fs::File::open(source).map_err(|_| "无法读取导出文件")?;
  std::io::copy(&mut input, &mut output).map_err(|_| "文件导出失败")?;
  output.as_file().sync_all().map_err(|_| "文件同步失败")?;
  output
    .persist(destination)
    .map_err(|_| "无法替换目标文件")?;
  Ok(())
}

pub async fn write(path: &Path, bytes: &[u8]) -> Result<()> {
  let path = path.to_owned();
  let bytes = bytes.to_vec();
  tokio::task::spawn_blocking(move || write_blocking(&path, &bytes, true))
    .await
    .map_err(|_| "文件写入任务失败")?
}
pub async fn copy(source: &Path, destination: &Path) -> Result<()> {
  let source = source.to_owned();
  let destination = destination.to_owned();
  tokio::task::spawn_blocking(move || copy_blocking(&source, &destination))
    .await
    .map_err(|_| "文件导出任务失败")?
}

/// CLI writes require explicit overwrite consent and never truncate a destination.
pub async fn write_export(path: &Path, bytes: Vec<u8>, overwrite: bool) -> Result<()> {
  let path = if path.is_absolute() {
    path.to_owned()
  } else {
    std::env::current_dir()
      .map_err(|_| "无法读取当前目录")?
      .join(path)
  };
  tokio::task::spawn_blocking(move || write_blocking(&path, &bytes, overwrite))
    .await
    .map_err(|_| "文件写入任务失败")?
}
