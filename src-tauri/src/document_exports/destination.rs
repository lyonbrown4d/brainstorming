use std::path::{Path, PathBuf};

/// Compare native file identity as well as canonical paths across all windows.
pub(crate) fn validate(path: &Path, extension: &str, sources: &[PathBuf]) -> Result<(), String> {
  if path
    .extension()
    .and_then(|value| value.to_str())
    .is_none_or(|value| !value.eq_ignore_ascii_case(extension))
  {
    return Err(format!("请选择 .{extension} 格式的导出文件名"));
  }
  if !path.exists() {
    return Ok(());
  }
  let canonical = path.canonicalize().map_err(|_| "无法检查导出位置")?;
  for source in sources {
    if source == &canonical || same_file::is_same_file(path, source).unwrap_or(false) {
      return Err("导出不能覆盖正在编辑的原生导图，请选择其他文件".into());
    }
  }
  Ok(())
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn protects_aliases_and_other_window_documents() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("open.brainstorming");
    std::fs::write(&source, b"native document").unwrap();
    let alias = directory.path().join("alias.pdf");
    std::fs::hard_link(&source, &alias).unwrap();
    assert!(validate(&alias, "pdf", &[source.clone()]).is_err());
    assert_eq!(std::fs::read(&source).unwrap(), b"native document");
    assert!(validate(&directory.path().join("new.pdf"), "pdf", &[source.clone()]).is_ok());
    assert!(validate(&source, "pdf", &[]).is_err());
  }
}
