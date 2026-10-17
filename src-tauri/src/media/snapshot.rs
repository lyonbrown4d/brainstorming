use super::snapshot_html::{css_urls, render, rewrite_css};
use super::{Result, network};
use base64::Engine;
use scraper::{Html, Selector};
use std::collections::{HashMap, HashSet, VecDeque};
use tokio_util::sync::CancellationToken;
use url::Url;

fn selector(value: &str) -> Selector {
    Selector::parse(value).expect("constant selector")
}
pub async fn prepare(url: &str, cancel: &CancellationToken) -> Result<String> {
    let fetched = network::fetch(url, 4 * 1024 * 1024, cancel).await?;
    if !matches!(fetched.mime.as_str(), "text/html" | "application/xhtml+xml") {
        return Err("网页未返回 HTML，无法生成静态预览".into());
    }
    let mut total = fetched.bytes.len();
    let base = fetched.url;
    let discovery_base = base.clone();
    let (html, mut pending, inline_css) = tokio::task::spawn_blocking(move || {
        let html = String::from_utf8_lossy(&fetched.bytes).into_owned();
        let (pending, css) = discover(&html, &discovery_base);
        (html, pending, css)
    })
    .await
    .map_err(|_| "网页解析任务失败")?;
    let mut images = HashMap::new();
    let mut sheets = HashMap::new();
    let mut seen = HashSet::new();
    while let Some((target, is_css)) = pending.pop_front() {
        if seen.len() >= 32 || total >= 8 * 1024 * 1024 {
            break;
        }
        if !seen.insert(target.clone()) {
            continue;
        }
        if !is_css && target.starts_with("data:") {
            let (target, image) = tokio::task::spawn_blocking(move || {
                let image = inline_raster(&target);
                (target, image)
            })
            .await
            .map_err(|_| "网页位图解码任务失败")?;
            if let Some(image) = image {
                images.insert(target, image);
            }
            continue;
        }
        let Ok(resource) =
            network::fetch(&target, (8 * 1024 * 1024 - total).min(512 * 1024), cancel).await
        else {
            continue;
        };
        total += resource.bytes.len();
        let (target, asset) = tokio::task::spawn_blocking(move || {
            let asset = if is_css && resource.mime == "text/css" {
                let css = String::from_utf8_lossy(&resource.bytes).into_owned();
                let images = css_urls(&css, &resource.url);
                Some(InlineAsset::Stylesheet(resource.url, css, images))
            } else if matches!(
                resource.mime.as_str(),
                "image/png" | "image/jpeg" | "image/gif" | "image/webp"
            ) && super::import::sniff(&resource.bytes, false) == resource.mime
            {
                Some(InlineAsset::Image(format!(
                    "data:{};base64,{}",
                    resource.mime,
                    base64::engine::general_purpose::STANDARD.encode(resource.bytes)
                )))
            } else {
                None
            };
            (target, asset)
        })
        .await
        .map_err(|_| "网页资源解析任务失败")?;
        match asset {
            Some(InlineAsset::Stylesheet(url, css, resources)) => {
                for image in resources {
                    pending.push_back((image, false));
                }
                sheets.insert(target, (url, css));
            }
            Some(InlineAsset::Image(image)) => {
                images.insert(target, image);
            }
            None => (),
        }
    }
    tokio::task::spawn_blocking(move || {
        let sheets: HashMap<_, _> = sheets
            .into_iter()
            .map(|(url, (base, css))| rewrite_css(&css, &base, &images).map(|css| (url, css)))
            .collect::<Result<_>>()?;
        let css = inline_css
            .into_iter()
            .map(|css| rewrite_css(&css, &base, &images))
            .collect::<Result<Vec<_>>>()?
            .join("\n");
        render(&html, &base, &images, &sheets, &css)
    })
    .await
    .map_err(|_| "网页离线渲染任务失败")?
}
enum InlineAsset {
    Stylesheet(Url, String, Vec<String>),
    Image(String),
}

fn discover(html: &str, base: &Url) -> (VecDeque<(String, bool)>, Vec<String>) {
    let document = Html::parse_document(html);
    let mut pending = VecDeque::new();
    let mut inline_css = Vec::new();
    for item in document.select(&selector(
        "img[src],link[rel~=stylesheet][href],meta[property='og:image'][content]",
    )) {
        let is_css = item.value().name() == "link";
        let attribute = if is_css {
            "href"
        } else if item.value().name() == "meta" {
            "content"
        } else {
            "src"
        };
        if let Some(url) = item.value().attr(attribute).and_then(|s| base.join(s).ok()) {
            pending.push_back((url.to_string(), is_css));
        }
    }
    for item in document.select(&selector("style,[style]")) {
        let css = if item.value().name() == "style" {
            item.text().collect::<String>()
        } else {
            item.value().attr("style").unwrap_or("").to_owned()
        };
        for url in css_urls(&css, base) {
            pending.push_back((url, false));
        }
        if item.value().name() == "style" {
            inline_css.push(css);
        }
    }
    (pending, inline_css)
}

fn inline_raster(value: &str) -> Option<String> {
    if value.len() > 512 * 1024 * 4 / 3 + 128 {
        return None;
    }
    let (prefix, data) = value.split_once(',')?;
    let mime = prefix.strip_prefix("data:")?.strip_suffix(";base64")?;
    if !matches!(
        mime,
        "image/png" | "image/jpeg" | "image/gif" | "image/webp"
    ) {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .ok()?;
    if bytes.len() > 512 * 1024 || super::import::sniff(&bytes, false) != mime {
        return None;
    }
    Some(value.to_owned())
}
