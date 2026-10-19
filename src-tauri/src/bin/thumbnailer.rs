//! freedesktop thumbnailer; never starts the editor or migrates the document.
use brainstorming_native::document::preview_reader;
use std::path::PathBuf;

#[tokio::main]
async fn main() {
  if run().await.is_err() {
    std::process::exit(1);
  }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
  let args: Vec<_> = std::env::args_os().skip(1).collect();
  if args.len() != 2 {
    return Err("usage: brainstorming-thumbnailer INPUT OUTPUT".into());
  }
  let source = PathBuf::from(&args[0]);
  let output = PathBuf::from(&args[1]);
  if source == output {
    return Err("output must differ from source".into());
  }
  let image = tokio::time::timeout(
    std::time::Duration::from_secs(5),
    preview_reader::read(&source, true),
  )
  .await??
  .into_iter()
  .next()
  .ok_or("no embedded thumbnail")?;
  write_output(&output, &image.png).await?;
  Ok(())
}

async fn write_output(
  output: &std::path::Path,
  png: &[u8],
) -> Result<(), Box<dyn std::error::Error>> {
  // GNOME may pre-create an empty destination in an isolated thumbnail sandbox.
  // Accept that regular file while rejecting symlinks and nonempty destinations;
  // open without truncation, then recheck the handle before writing any bytes.
  let mut file = match tokio::fs::OpenOptions::new()
    .write(true)
    .create_new(true)
    .open(output)
    .await
  {
    Ok(file) => file,
    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
      #[cfg(unix)]
      {
        let expected = tokio::fs::symlink_metadata(output).await?;
        let output = output.to_owned();
        let file = tokio::task::spawn_blocking(move || open_existing(&output, &expected)).await??;
        tokio::fs::File::from_std(file)
      }
      #[cfg(not(unix))]
      return Err(error.into());
    }
    Err(error) => return Err(error.into()),
  };
  use tokio::io::AsyncWriteExt;
  file.write_all(png).await?;
  file.flush().await?;
  Ok(())
}

#[cfg(unix)]
fn open_existing(
  output: &std::path::Path,
  expected: &std::fs::Metadata,
) -> std::io::Result<std::fs::File> {
  use rustix::fs::OFlags;
  use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
  if !expected.is_file() || expected.len() != 0 {
    return Err(std::io::Error::other(
      "thumbnail destination is not an empty regular file",
    ));
  }
  // O_NOFOLLOW closes the stat/open symlink race. O_NONBLOCK prevents a raced
  // FIFO from blocking before handle metadata can reject it. Never truncate.
  let file = std::fs::OpenOptions::new()
    .write(true)
    .custom_flags((OFlags::NOFOLLOW | OFlags::NONBLOCK).bits() as i32)
    .open(output)?;
  let actual = file.metadata()?;
  if !actual.is_file()
    || actual.len() != 0
    || actual.dev() != expected.dev()
    || actual.ino() != expected.ino()
  {
    return Err(std::io::Error::other("thumbnail destination changed"));
  }
  Ok(file)
}

#[cfg(all(test, unix))]
mod tests {
  use super::*;
  #[tokio::test]
  async fn output_accepts_new_and_desktop_created_empty_files_but_never_existing_data() {
    let folder = tempfile::tempdir().unwrap();
    for name in ["new.png", "empty.png"] {
      let path = folder.path().join(name);
      if name == "empty.png" {
        tokio::fs::write(&path, []).await.unwrap();
      }
      write_output(&path, b"PNG").await.unwrap();
      assert_eq!(tokio::fs::read(&path).await.unwrap(), b"PNG");
      assert!(write_output(&path, b"replacement").await.is_err());
      assert_eq!(tokio::fs::read(&path).await.unwrap(), b"PNG");
    }
    #[cfg(unix)]
    {
      let source = folder.path().join("original");
      tokio::fs::write(&source, []).await.unwrap();
      let alias = folder.path().join("alias");
      std::os::unix::fs::symlink(&source, &alias).unwrap();
      assert!(write_output(&alias, b"PNG").await.is_err());
      assert!(tokio::fs::read(source).await.unwrap().is_empty());
    }
  }
  #[cfg(unix)]
  #[test]
  fn output_rejects_a_symlink_or_different_file_swapped_after_metadata_read() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("output.png");
    let target = folder.path().join("untouched");
    std::fs::write(&path, []).unwrap();
    std::fs::write(&target, []).unwrap();
    let expected = std::fs::symlink_metadata(&path).unwrap();
    std::fs::rename(&path, folder.path().join("observed-file")).unwrap();
    std::os::unix::fs::symlink(&target, &path).unwrap();
    assert!(open_existing(&path, &expected).is_err());
    assert!(std::fs::read(&target).unwrap().is_empty());
    std::fs::remove_file(&path).unwrap();
    std::fs::write(&path, []).unwrap();
    assert!(open_existing(&path, &expected).is_err());
    assert!(std::fs::read(&path).unwrap().is_empty());
    assert!(std::fs::read(&target).unwrap().is_empty());
  }
}
