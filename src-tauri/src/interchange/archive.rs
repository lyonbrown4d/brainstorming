use std::{
  collections::{HashMap, HashSet},
  io::{Cursor, Read, Write},
};
use zip::{CompressionMethod, ZipWriter, read::ZipArchive, write::SimpleFileOptions};

const COMPRESSED: usize = 32 * 1024 * 1024;
const ENTRY: u64 = 10 * 1024 * 1024;
const EXPANDED: u64 = 64 * 1024 * 1024;
const ENTRIES: usize = 512;

pub fn read(bytes: &[u8]) -> Result<HashMap<String, Vec<u8>>, String> {
  if bytes.len() > COMPRESSED {
    return Err("ZIP 文件超过 32 MiB 限制".into());
  }
  reject_zip64(bytes)?;
  let mut zip =
    ZipArchive::new(Cursor::new(bytes)).map_err(|_| "ZIP 文件损坏或使用不支持的 ZIP 扩展")?;
  if zip.len() > ENTRIES {
    return Err("ZIP 文件条目超过 512 项限制".into());
  }
  let mut expanded = 0u64;
  let mut names = HashSet::new();
  for index in 0..zip.len() {
    let file = zip.by_index(index).map_err(|_| "ZIP 目录无效")?;
    let name = file.name().map_err(|_| "ZIP 文件名编码无效")?;
    check_path(&name)?;
    if !names.insert(name.to_string()) {
      return Err("ZIP 包含重复文件路径".into());
    }
    if file.encrypted() {
      return Err("不支持加密的 ZIP 文件".into());
    }
    if !matches!(
      file.compression(),
      CompressionMethod::Stored | CompressionMethod::Deflated
    ) {
      return Err("不支持此 ZIP 压缩方式".into());
    }
    if file.size() > ENTRY {
      return Err("ZIP 单个条目超过 10 MiB 限制".into());
    }
    if file.size() > 0
      && (file.compressed_size() == 0 || file.size() / file.compressed_size() > 10_000)
    {
      return Err("ZIP 条目压缩比超过安全限制".into());
    }
    if file
      .extra_data_fields()
      .any(|field| matches!(field, zip::ExtraField::Zip64ExtendedInformation(_)))
    {
      return Err("不支持 ZIP64 扩展".into());
    }
    expanded = expanded
      .checked_add(file.size())
      .ok_or("ZIP 解压大小溢出")?;
    if expanded > EXPANDED {
      return Err("ZIP 解压后超过 64 MiB 限制".into());
    }
  }
  let mut result = HashMap::new();
  let mut actual_total = 0u64;
  for index in 0..zip.len() {
    let mut file = zip.by_index(index).map_err(|_| "ZIP 条目读取失败")?;
    let name = file.name().map_err(|_| "ZIP 文件名编码无效")?.to_string();
    let mut data = Vec::with_capacity(file.size() as usize);
    let mut limited = (&mut file).take(ENTRY + 1);
    limited
      .read_to_end(&mut data)
      .map_err(|_| "ZIP 文件解压失败或完整性校验失败")?;
    actual_total += data.len() as u64;
    if data.len() as u64 != file.size() || actual_total > EXPANDED {
      return Err("ZIP 解压大小超过限制或与目录不一致".into());
    }
    result.insert(name, data);
  }
  Ok(result)
}

pub fn write(entries: &[(String, Vec<u8>)]) -> Result<Vec<u8>, String> {
  if entries.len() > ENTRIES {
    return Err("XMind 文件条目超过 512 项限制".into());
  }
  let mut names = HashSet::new();
  let mut expanded = 0u64;
  for (name, data) in entries {
    check_path(name)?;
    if !names.insert(name) {
      return Err("XMind 包含重复文件路径".into());
    }
    if data.len() as u64 > ENTRY {
      return Err("XMind 单个条目超过 10 MiB 限制".into());
    }
    expanded = expanded
      .checked_add(data.len() as u64)
      .ok_or("XMind 解压大小溢出")?;
    if expanded > EXPANDED {
      return Err("XMind 解压后超过 64 MiB 限制".into());
    }
  }
  let mut output = Cursor::new(Vec::new());
  {
    let mut zip = ZipWriter::new(&mut output);
    for (name, data) in entries {
      zip
        .start_file(
          name,
          SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|_| "XMind 条目打包失败")?;
      zip.write_all(data).map_err(|_| "XMind 条目写入失败")?;
    }
    zip.finish().map_err(|_| "XMind 文件打包失败")?;
  }
  let bytes = output.into_inner();
  if bytes.len() > COMPRESSED {
    return Err("XMind 文件超过 32 MiB 限制".into());
  }
  Ok(bytes)
}

fn check_path(name: &str) -> Result<(), String> {
  let parts: Vec<_> = name.split('/').collect();
  if name.is_empty()
    || name.starts_with('/')
    || name.contains(['\\', '\0'])
    || name.as_bytes().get(1) == Some(&b':')
    || parts.iter().enumerate().any(|(index, part)| {
      *part == "." || *part == ".." || (part.is_empty() && index + 1 != parts.len())
    })
  {
    return Err("ZIP 包含不安全的文件路径".into());
  }
  Ok(())
}

fn reject_zip64(bytes: &[u8]) -> Result<(), String> {
  // The classic EOCD is mandatory. ZIP64 sentinels and locator are rejected before inflation.
  let start = bytes.len().saturating_sub(22 + 65_535);
  let eocd = (start..bytes.len().saturating_sub(21))
    .rev()
    .find(|&index| {
      bytes.get(index..index + 4) == Some(&b"PK\x05\x06"[..])
        && read_u16(bytes, index + 20)
          .is_some_and(|length| index + 22 + length as usize == bytes.len())
    })
    .ok_or("ZIP 目录无效")?;
  if read_u16(bytes, eocd + 8) == Some(u16::MAX)
    || read_u16(bytes, eocd + 10) == Some(u16::MAX)
    || read_u32(bytes, eocd + 12) == Some(u32::MAX)
    || read_u32(bytes, eocd + 16) == Some(u32::MAX)
    || (eocd >= 20 && bytes.get(eocd - 20..eocd - 16) == Some(&b"PK\x06\x07"[..]))
  {
    return Err("不支持 ZIP64 扩展".into());
  }
  Ok(())
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
  Some(u16::from_le_bytes(
    bytes.get(offset..offset + 2)?.try_into().ok()?,
  ))
}
fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
  Some(u32::from_le_bytes(
    bytes.get(offset..offset + 4)?.try_into().ok()?,
  ))
}
