use super::Result;
use futures_util::StreamExt;
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use tokio_util::sync::CancellationToken;
use url::Url;

pub fn normalize(input: &str) -> Result<String> {
    if input.is_empty() || input.len() > 2048 || input.chars().any(char::is_control) {
        return Err("网页地址无效".into());
    }
    let mut url = Url::parse(input).map_err(|_| "网页地址无效")?;
    if !matches!(url.scheme(), "https" | "http")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err("只支持无认证信息的 HTTP 或 HTTPS 网页地址".into());
    }
    url.set_fragment(None);
    Ok(url.to_string())
}
pub fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192
                    && (b == 168 || (b == 0 && (c == 0 || c == 2)) || (b == 88 && c == 99)))
                || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(ip) => {
            let s = ip.segments();
            // Only global unicast; exclude special-purpose, documentation, and
            // transition ranges which can route a public-looking address privately.
            (s[0] & 0xe000) == 0x2000
                && !(s[0] == 0x2001 && s[1] < 0x200)
                && !(s[0] == 0x2001 && s[1] == 0xdb8)
                && s[0] != 0x2002
                && !(s[0] == 0x3fff && s[1] < 0x1000)
        }
    }
}
async fn addresses(url: &Url) -> Result<Vec<SocketAddr>> {
    let host = url
        .host_str()
        .ok_or("网页主机无效")?
        .trim_matches(['[', ']']);
    let port = url.port_or_known_default().ok_or("网页端口无效")?;
    let addresses: Vec<_> = if let Ok(ip) = host.parse::<IpAddr>() {
        vec![SocketAddr::new(ip, port)]
    } else {
        tokio::time::timeout(
            Duration::from_secs(5),
            tokio::net::lookup_host((host, port)),
        )
        .await
        .map_err(|_| "网页 DNS 查询超时")?
        .map_err(|_| "网页 DNS 查询失败")?
        .collect()
    };
    if addresses.is_empty()
        || addresses.len() > 64
        || addresses.iter().any(|a| !public_address(a.ip()))
    {
        return Err("网页目标不是公开网络地址".into());
    }
    Ok(addresses)
}
pub struct Fetched {
    pub url: Url,
    pub mime: String,
    pub bytes: Vec<u8>,
}
pub async fn fetch(input: &str, limit: usize, cancel: &CancellationToken) -> Result<Fetched> {
    let mut url = Url::parse(&normalize(input)?).map_err(|_| "网页地址无效")?;
    for _ in 0..=5 {
        let addresses = tokio::select! { biased; _=cancel.cancelled()=>return Err("网页预览已取消".into()),result=addresses(&url)=>result? };
        let host = url
            .host_str()
            .ok_or("网页主机无效")?
            .trim_matches(['[', ']']);
        // Fresh connection pool per hop: validated DNS is pinned through the
        // actual TCP connection, including redirects. Environment proxies are disabled.
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(host, &addresses)
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(10))
            .user_agent("Brainstorming-StaticPreview/1")
            .build()
            .map_err(|_| "网页网络服务无法初始化")?;
        let response = tokio::select! { biased; _=cancel.cancelled()=>return Err("网页预览已取消".into()),
        result=client.get(url.clone()).header("Accept-Encoding","identity").send()=>result.map_err(|_|"网页无法加载")? };
        if let Some(remote) = response.remote_addr() {
            if !addresses.iter().any(|a| a.ip() == remote.ip()) {
                return Err("网页连接地址与 DNS 校验不一致".into());
            }
        } else {
            return Err("网页连接地址无法确认".into());
        }
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|s| s.to_str().ok())
                .ok_or("网页重定向无效")?;
            url = url.join(location).map_err(|_| "网页重定向无效")?;
            url = Url::parse(&normalize(url.as_str())?).map_err(|_| "网页重定向无效")?;
            continue;
        }
        if !response.status().is_success() {
            return Err("网页返回错误状态".into());
        }
        if response.content_length().is_some_and(|n| n > limit as u64) {
            return Err("网页资源超过大小限制".into());
        }
        if response
            .headers()
            .get("content-encoding")
            .is_some_and(|v| v != "identity")
        {
            return Err("网页压缩编码不受支持".into());
        }
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|s| s.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        loop {
            let next = tokio::select! { biased; _=cancel.cancelled()=>return Err("网页预览已取消".into()),next=stream.next()=>next };
            let Some(chunk) = next else {
                break;
            };
            let chunk = chunk.map_err(|_| "网页资源读取失败")?;
            if bytes.len().saturating_add(chunk.len()) > limit {
                return Err("网页资源超过大小限制".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        return Ok(Fetched { url, mime, bytes });
    }
    Err("网页重定向次数超过限制".into())
}
