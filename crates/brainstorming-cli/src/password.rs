use std::io::{BufRead, Read};
use zeroize::Zeroizing;

pub fn read(enabled: bool) -> Result<Option<Zeroizing<String>>, String> {
  if !enabled {
    return Ok(None);
  }
  let mut bytes = Zeroizing::new(Vec::new());
  std::io::stdin()
    .lock()
    .take(4099)
    .read_until(b'\n', &mut bytes)
    .map_err(|_| "无法读取密码")?;
  if bytes.ends_with(b"\n") {
    bytes.pop();
    if bytes.ends_with(b"\r") {
      bytes.pop();
    }
  }
  if bytes.is_empty() || bytes.len() > 4096 {
    return Err("密码长度必须为 1–4096 字节".into());
  }
  let text = std::str::from_utf8(&bytes).map_err(|_| "密码必须为 UTF-8")?;
  Ok(Some(Zeroizing::new(text.to_owned())))
}
