use super::Result;
use lol_html::{RewriteStrSettings, element, html_content::ContentType, rewrite_str};
use regex::Regex;
use scraper::{Html, Selector};
use std::{cell::Cell, collections::HashMap, sync::OnceLock};
use url::Url;
pub(super) const MAX_HTML: usize = 4 * 1024 * 1024;
pub(super) const CSP: &str = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
fn urls_pattern() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r#"(?i)url\(\s*[\"']?([^\s\)\"']+)[\"']?\s*\)"#).unwrap())
}
pub(super) fn css_urls(css: &str, base: &Url) -> Vec<String> {
    urls_pattern()
        .captures_iter(css)
        .filter_map(|c| base.join(&c[1]).ok())
        .filter(|u| matches!(u.scheme(), "http" | "https"))
        .map(|u| u.to_string())
        .take(64)
        .collect()
}
pub(super) fn rewrite_css(
    css: &str,
    base: &Url,
    images: &HashMap<String, String>,
) -> Result<String> {
    static IMPORTS: OnceLock<Regex> = OnceLock::new();
    let imports = IMPORTS.get_or_init(|| Regex::new(r#"(?is)@import\s+[^;]+;"#).unwrap());
    let css = imports.replace_all(css, "");
    let mut output = String::new();
    let mut position = 0;
    for caps in urls_pattern().captures_iter(&css) {
        let matched = caps.get(0).unwrap();
        let value = base
            .join(&caps[1])
            .ok()
            .and_then(|u| images.get(u.as_str()))
            .map(String::as_str)
            .unwrap_or("data:,");
        if output
            .len()
            .saturating_add(matched.start() - position)
            .saturating_add(value.len())
            .saturating_add(8)
            > MAX_HTML
        {
            return Err("网页样式展开后超过 4 MiB".into());
        }
        output.push_str(&css[position..matched.start()]);
        output.push_str("url(\"");
        output.push_str(value);
        output.push_str("\")");
        position = matched.end();
    }
    if output.len() + css.len() - position > MAX_HTML {
        return Err("网页样式超过 4 MiB".into());
    }
    output.push_str(&css[position..]);
    // Closing-tag case/whitespace tricks cannot escape the style element.
    static STYLE_END: OnceLock<Regex> = OnceLock::new();
    Ok(STYLE_END
        .get_or_init(|| Regex::new("(?i)</style").unwrap())
        .replace_all(&output, "<\\/style")
        .into_owned())
}
fn charge(used: &Cell<usize>, length: usize) -> Result<()> {
    let next = used.get().saturating_add(length);
    if next > MAX_HTML {
        return Err("网页静态内容展开后超过 4 MiB".into());
    }
    used.set(next);
    Ok(())
}
pub(super) fn render(
    html: &str,
    base: &Url,
    images: &HashMap<String, String>,
    sheets: &HashMap<String, String>,
    css: &str,
) -> Result<String> {
    let used = Cell::new(0);
    charge(&used, html.len() + css.len() + 1024)?;
    let output=rewrite_str(html,RewriteStrSettings::new().append_element_content_handler(
        element!("script,style,meta,base,iframe,frame,frameset,object,embed,portal,applet,source,video,audio,svg,math",|el| { el.remove(); Ok(()) }))
        .append_element_content_handler(element!("link",|el| {
            let css=el.get_attribute("href").and_then(|s|base.join(&s).ok()).and_then(|u|sheets.get(u.as_str()));
            if let Some(css)=css { charge(&used,css.len()+15)?; el.replace(&format!("<style>{css}</style>"),ContentType::Html); } else { el.remove(); } Ok(())
        }))
        .append_element_content_handler(element!("*",|el| {
            let attrs:Vec<String>=el.attributes().iter().map(|a|a.name().to_owned()).collect();
            for name in attrs { if name.starts_with("on") || matches!(name.as_str(),"srcset"|"href"|"xlink:href"|"action"|"formaction"|"poster"|"background"|"ping"|"data"|"srcdoc") { el.remove_attribute(&name); } }
            if let Some(src)=el.get_attribute("src") {
                let image=base.join(&src).ok().and_then(|u|images.get(u.as_str()));
                if el.tag_name()=="img" { let value=image.map(String::as_str).unwrap_or("data:,"); charge(&used,value.len())?; el.set_attribute("src",value)?; } else { el.remove_attribute("src"); }
            }
            if let Some(style)=el.get_attribute("style") { let style=rewrite_css(&style,base,images)?; charge(&used,style.len())?; el.set_attribute("style",&style)?; }
            Ok(())
        }))
    ).map_err(|_|"网页静态内容解析失败或展开后超过 4 MiB")?;
    let parsed = Html::parse_document(&output);
    let body = parsed.select(&Selector::parse("body").unwrap()).next();
    let empty = body.is_none_or(|body| body.text().all(|s| s.trim().is_empty()))
        && !parsed
            .select(&Selector::parse("img").unwrap())
            .any(|image| {
                image
                    .value()
                    .attr("src")
                    .is_some_and(|src| src.starts_with("data:image/"))
            });
    let output = if empty {
        metadata_card(html, base, images)?
    } else {
        output
    };
    let output = format!(
        "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"{CSP}\"><meta name=\"viewport\" content=\"width=1280\"><style>html{{background:white;color:#171717}}body{{margin:24px;font:16px system-ui;overflow:hidden}}img{{max-width:100%}}{css}</style>{output}"
    );
    if output.len() > MAX_HTML {
        return Err("网页静态内容展开后超过 4 MiB".into());
    }
    Ok(output)
}
fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
fn metadata_card(html: &str, base: &Url, images: &HashMap<String, String>) -> Result<String> {
    let parsed = Html::parse_document(html);
    let meta = |selector: &str| {
        parsed
            .select(&Selector::parse(selector).unwrap())
            .next()
            .and_then(|e| e.value().attr("content"))
            .map(str::to_owned)
    };
    let title = meta("meta[property='og:title']").or_else(|| {
        parsed
            .select(&Selector::parse("title").unwrap())
            .next()
            .map(|e| e.text().collect::<String>())
    });
    let description =
        meta("meta[property='og:description']").or_else(|| meta("meta[name=description]"));
    let image = meta("meta[property='og:image']")
        .and_then(|u| base.join(&u).ok())
        .and_then(|u| images.get(u.as_str()));
    if title.as_ref().is_none_or(|t| t.trim().is_empty())
        && description.as_ref().is_none_or(|t| t.trim().is_empty())
        && image.is_none()
    {
        return Err("网页依赖 JavaScript 且没有可用元数据，无法生成静态预览".into());
    }
    let image = image
        .map(|src| format!("<img style=\"max-height:440px\" src=\"{src}\">"))
        .unwrap_or_default();
    Ok(format!(
        "<article><small>{}</small><h1>{}</h1><p>{}</p>{image}<p>页面元数据预览</p></article>",
        escape(base.as_str()),
        escape(title.as_deref().unwrap_or("")),
        escape(description.as_deref().unwrap_or(""))
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scripts_remote_frames_and_network_attributes_are_removed() {
        let url = Url::parse("https://example.com/").unwrap();
        let html=render("<body onload='evil()'><h1>Hello</h1><script>evil()</script><iframe src='http://localhost/'></iframe><a href='file:///private'>link</a><img src='https://private/'></body>",&url,&HashMap::new(),&HashMap::new(),"").unwrap();
        assert!(!html.contains("evil()"));
        assert!(!html.contains("iframe"));
        assert!(!html.contains("file:///"));
        assert!(!html.contains("https://private/"));
        assert!(html.contains(CSP));
    }
    #[test]
    fn repeated_inline_images_fail_before_unbounded_expansion() {
        let url = Url::parse("https://example.com/").unwrap();
        let mut images = HashMap::new();
        images.insert(
            "https://example.com/p.png".into(),
            format!("data:image/png;base64,{}", "A".repeat(512 * 1024)),
        );
        let html = format!(
            "<body><h1>Page</h1>{}</body>",
            "<img src='p.png'>".repeat(100)
        );
        assert!(render(&html, &url, &images, &HashMap::new(), "").is_err());
        let css = "a{background:url(p.png)}".repeat(100);
        assert!(rewrite_css(&css, &url, &images).is_err());
    }
    #[test]
    fn empty_javascript_page_uses_real_metadata_or_explicit_failure() {
        let url = Url::parse("https://example.com/").unwrap();
        let html = render(
            "<title>Actual title</title><div id='root'></div><script>render()</script>",
            &url,
            &HashMap::new(),
            &HashMap::new(),
            "",
        )
        .unwrap();
        assert!(html.contains("Actual title"));
        assert!(html.contains("页面元数据预览"));
        assert!(
            render(
                "<div id='root'></div><script>render()</script>",
                &url,
                &HashMap::new(),
                &HashMap::new(),
                ""
            )
            .is_err()
        );
    }
}
