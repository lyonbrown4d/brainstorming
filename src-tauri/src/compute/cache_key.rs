use digest_io::IoWrapper;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{self, BufWriter, Write};

const INPUT_LIMIT: usize = 64 * 1024 * 1024;
const HASH_BUFFER_SIZE: usize = 32 * 1024;

pub(super) fn cache_key(input: &impl Serialize) -> Result<[u8; 32], String> {
  let mut writer = LimitedWriter {
    inner: BufWriter::with_capacity(HASH_BUFFER_SIZE, IoWrapper(Sha256::new())),
    remaining: INPUT_LIMIT,
    exceeded: false,
  };
  // Count the actual JSON bytes before buffering, including escapes and UTF-8.
  if serde_json::to_writer(&mut writer, input).is_err() {
    return Err(
      if writer.exceeded {
        "计算输入超过限制"
      } else {
        "计算输入无效"
      }
      .into(),
    );
  }
  writer.inner.flush().map_err(|_| "计算输入无效")?;
  Ok(writer.inner.get_ref().0.clone().finalize().into())
}

/// Application input budget; buffering and digest I/O remain standard adapters.
struct LimitedWriter<W> {
  inner: W,
  remaining: usize,
  exceeded: bool,
}

impl<W: Write> Write for LimitedWriter<W> {
  fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
    if bytes.len() > self.remaining {
      self.exceeded = true;
      return Err(io::Error::other("计算输入超过限制"));
    }
    self.inner.write_all(bytes)?;
    self.remaining -= bytes.len();
    Ok(bytes.len())
  }

  fn flush(&mut self) -> io::Result<()> {
    self.inner.flush()
  }
}

#[cfg(test)]
#[path = "cache_key_tests.rs"]
mod tests;
