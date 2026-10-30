//! Fixed, offline original and Fluent Emoji resources. Request values are IDs, never paths.
mod originals;
use base64::{Engine, engine::general_purpose::STANDARD};
use moka::future::Cache;
use resvg::{tiny_skia, usvg};
use serde::{Deserialize, Serialize};
use std::{
  sync::{Arc, OnceLock},
  time::Duration,
};

type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Artwork {
  id: String,
  title: [String; 2],
  keywords: [String; 2],
  group: String,
  source: String,
  #[serde(default, skip_serializing)]
  svg: String,
  #[serde(default)]
  thumbnail: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Catalog {
  version: u8,
  #[serde(rename = "licenseText")]
  license_text: String,
  items: Vec<Artwork>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
  id: String,
  name: String,
  mime_type: &'static str,
  data: String,
}
static CATALOG: OnceLock<Result<Catalog>> = OnceLock::new();
static RENDER_SLOTS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
static PNGS: OnceLock<Cache<String, Arc<Asset>>> = OnceLock::new();
fn catalog() -> Result<&'static Catalog> {
  CATALOG
    .get_or_init(|| {
      let mut catalog: Catalog = serde_json::from_str(include_str!("catalog.json"))
        .map_err(|_| "内置素材目录无效".to_string())?;
      let mut ids = std::collections::HashSet::new();
      if catalog.version != 1 || catalog.items.len() != 58 {
        return Err("内置素材目录无效".into());
      }
      for item in &mut catalog.items {
        if !ids.insert(item.id.clone())
          || item.id.is_empty()
          || !item
            .id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
          || !["ideas", "plans", "feelings", "nature", "scenes"].contains(&item.group.as_str())
          || item.svg.contains("href=")
          || item.svg.contains("<script")
        {
          return Err("内置素材目录无效".into());
        }
        match item.source.as_str() {
          "fluent" if !item.svg.is_empty() => {
            item.thumbnail = format!("data:image/svg+xml;base64,{}", STANDARD.encode(&item.svg));
          }
          "original"
            if originals::get(&item.id).is_some()
              && item.thumbnail.starts_with("data:image/png;base64,")
              && item.thumbnail.len() < 100_000 => {}
          _ => return Err("内置素材来源无效".into()),
        }
      }
      Ok(catalog)
    })
    .as_ref()
    .map_err(Clone::clone)
}
pub fn list() -> Result<Catalog> {
  Ok(catalog()?.clone())
}
pub async fn get(id: &str) -> Result<Arc<Asset>> {
  let artwork = catalog()?
    .items
    .iter()
    .find(|item| item.id == id)
    .cloned()
    .ok_or("内置素材不存在")?;
  PNGS
    .get_or_init(|| {
      Cache::builder()
        .max_capacity(58)
        .time_to_idle(Duration::from_secs(3600))
        .build()
    })
    .try_get_with(id.to_string(), async move {
      let permit = RENDER_SLOTS
        .acquire()
        .await
        .map_err(|_| "内置素材服务已关闭".to_string())?;
      tokio::task::spawn_blocking(move || {
        let _permit = permit;
        render(&artwork)
      })
      .await
      .map_err(|_| "内置素材生成任务失败".to_string())?
      .map(Arc::new)
    })
    .await
    .map_err(|error| (*error).clone())
}
fn render(artwork: &Artwork) -> Result<Asset> {
  if let Some(bytes) = originals::get(&artwork.id) {
    if bytes.len() > 8 * 1024 * 1024 {
      return Err("内置素材超过资源限制".into());
    }
    return Ok(Asset {
      id: format!("builtin-art-v1-{}", artwork.id),
      name: format!("{}.png", artwork.id),
      mime_type: "image/png",
      data: STANDARD.encode(bytes),
    });
  }
  let options = usvg::Options {
    image_href_resolver: usvg::ImageHrefResolver {
      resolve_data: Box::new(|_, _, _| None),
      resolve_string: Box::new(|_, _| None),
    },
    ..Default::default()
  };
  let tree = usvg::Tree::from_str(&artwork.svg, &options).map_err(|_| "内置素材无法解析")?;
  let mut pixmap = tiny_skia::Pixmap::new(512, 512).ok_or("内置素材无法分配内存")?;
  resvg::render(
    &tree,
    tiny_skia::Transform::from_scale(16.0, 16.0),
    &mut pixmap.as_mut(),
  );
  let png = pixmap.encode_png().map_err(|_| "内置素材编码失败")?;
  Ok(Asset {
    id: format!("builtin-art-v1-{}", artwork.id),
    name: format!("{}.png", artwork.id),
    mime_type: "image/png",
    data: STANDARD.encode(png),
  })
}
#[cfg(test)]
mod tests {
  use super::*;
  #[tokio::test]
  async fn fixed_catalog_renders_offline_and_rejects_paths() {
    let catalog = list().unwrap();
    assert_eq!(catalog.items.len(), 58);
    for item in catalog.items {
      assert!(item.thumbnail.starts_with("data:image/"));
      assert!(item.thumbnail.len() < 100_000);
      let asset = get(&item.id).await.unwrap();
      let bytes = STANDARD.decode(&asset.data).unwrap();
      let image = image::load_from_memory(&bytes).unwrap();
      let expected = if item.source == "original" { 1254 } else { 512 };
      assert_eq!((image.width(), image.height()), (expected, expected));
      if item.source == "original" {
        assert_eq!(bytes, originals::get(&item.id).unwrap());
        let thumbnail = STANDARD
          .decode(
            item
              .thumbnail
              .strip_prefix("data:image/png;base64,")
              .unwrap(),
          )
          .unwrap();
        let preview = image::load_from_memory(&thumbnail).unwrap();
        assert!(preview.width() <= 128 && preview.height() <= 128);
      }
      assert!(Arc::ptr_eq(&asset, &get(&item.id).await.unwrap()));
    }
    for id in [
      "../catalog.json",
      "/tmp/image.svg",
      "https://example.org",
      "missing",
    ] {
      assert!(get(id).await.is_err());
    }
  }
}
