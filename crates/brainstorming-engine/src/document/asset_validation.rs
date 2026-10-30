use super::{Result, error::invalid, resources::assert_object_id, validation::*};
use serde_json::Value;

pub(crate) fn assets(doc: &Value) -> Result<()> {
  if let Some(assets) = doc.get("assets") {
    for (key, asset) in object(assets)? {
      keys(asset, &["id", "name", "mimeType", "storage", "data"])?;
      id(&asset["id"])?;
      if asset["id"] != key.as_str()
        || key.len() > 128
        || !key
          .bytes()
          .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
      {
        return Err(invalid("资源标识无效"));
      }
      let name = text(&asset["name"])?;
      if name.trim().is_empty()
        || name.encode_utf16().count() > 255
        || name
          .chars()
          .any(|c| c.is_control() || c == '/' || c == '\\')
      {
        return Err(invalid("资源文件名无效"));
      }
      let mime = text(&asset["mimeType"])?;
      let parts: Vec<_> = mime.split('/').collect();
      if mime.len() > 127
        || parts.len() != 2
        || parts.iter().any(|part| {
          part.is_empty()
            || !part.bytes().all(|b| {
              b.is_ascii_lowercase() || b.is_ascii_digit() || b"!#$%&'*+.^_`|~-".contains(&b)
            })
        })
      {
        return Err(invalid("资源 MIME 类型无效"));
      }
      if let Some(storage) = asset.get("storage") {
        super::presentation_validation::storage(storage)?;
        if asset.get("data").is_some() {
          return Err(invalid("资源不能同时包含内联字节和存储引用"));
        }
        assert_object_id(text(&storage["objectId"])?)?;
        integer(&storage["byteLength"], 0, 256 * 1024u64.pow(3))?;
        if let Some(preview) = storage.get("preview") {
          assert_object_id(text(&preview["objectId"])?)?;
          integer(&preview["byteLength"], 0, 16 * 1024 * 1024)?;
        }
      } else if text(&asset["data"])?.len() > 11_184_812 {
        return Err(invalid("内联资源超过 8 MiB"));
      }
    }
  }
  Ok(())
}
