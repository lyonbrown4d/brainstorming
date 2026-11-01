//! libvips can finish PNG pixels before checking the final IDAT checksum.
//! Reuse the PNG decoder's bounded chunk reader without a second pixel buffer.
use std::{
  fs::File,
  io::{BufRead, BufReader, Cursor, Seek},
  path::Path,
};

type Result<T> = std::result::Result<T, String>;

pub(super) fn file(path: &Path) -> Result<()> {
  let file = File::open(path).map_err(|_| "图片文件无法打开")?;
  validate(BufReader::new(file))
}

pub(super) fn bytes(bytes: &[u8]) -> Result<()> {
  validate(Cursor::new(bytes))
}

fn validate(mut source: impl BufRead + Seek) -> Result<()> {
  if !source
    .fill_buf()
    .map_err(|_| "图片文件无法读取")?
    .starts_with(b"\x89PNG\r\n\x1a\n")
  {
    return Ok(());
  }
  let mut decoder = png::Decoder::new_with_limits(
    source,
    png::Limits {
      bytes: 64 * 1024 * 1024,
    },
  );
  decoder.set_ignore_text_chunk(true);
  decoder.set_ignore_iccp_chunk(true);
  let mut reader = decoder.read_info().map_err(|_| "PNG 数据损坏或超过限制")?;
  reader.finish().map_err(|_| "PNG 数据损坏或超过限制".into())
}
