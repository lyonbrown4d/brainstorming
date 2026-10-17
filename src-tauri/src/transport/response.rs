use super::{ServerState, resource_stream};
use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, HeaderValue, Method, StatusCode, Uri},
    response::Response,
};
use http_range::HttpRange;
use subtle::ConstantTimeEq;

#[derive(Debug, PartialEq, Eq)]
pub struct ByteRange {
    pub offset: u64,
    pub length: u64,
}
pub fn parse_range(value: &str, size: u64) -> std::result::Result<ByteRange, u16> {
    if !value.starts_with("bytes=") {
        return Err(416);
    }
    if value[6..].contains(',') {
        return Err(416);
    }
    if value[6..].trim().is_empty() {
        return Err(400);
    }
    let items = HttpRange::parse(value, size).map_err(|error| match error {
        http_range::HttpRangeParseError::InvalidRange => 400u16,
        http_range::HttpRangeParseError::NoOverlap => 416u16,
    })?;
    if items.len() != 1 || items[0].length == 0 {
        return Err(416);
    }
    Ok(ByteRange {
        offset: items[0].start,
        length: items[0].length,
    })
}
fn headers(origin: Option<&str>) -> HeaderMap {
    let mut output = HeaderMap::new();
    for (key, value) in [
        ("accept-ranges", "bytes"),
        ("cache-control", "private, no-store"),
        ("x-content-type-options", "nosniff"),
        ("content-security-policy", "default-src 'none'; sandbox"),
        ("vary", "Origin"),
        (
            "access-control-expose-headers",
            "Content-Range, Accept-Ranges, Content-Length",
        ),
    ] {
        output.insert(key, HeaderValue::from_static(value));
    }
    if let Some(origin) = origin.and_then(|s| HeaderValue::from_str(s).ok()) {
        output.insert("access-control-allow-origin", origin);
    }
    output
}
fn response(status: u16, headers: HeaderMap, body: Body) -> Response {
    let mut result = Response::new(body);
    *result.status_mut() =
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    *result.headers_mut() = headers;
    result
}
fn id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn allowed_mime(value: &str) -> bool {
    matches!(
        value,
        "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp"
            | "image/avif"
            | "image/tiff"
            | "audio/mpeg"
            | "audio/wav"
            | "audio/ogg"
            | "audio/webm"
            | "audio/mp4"
            | "audio/aac"
            | "audio/flac"
            | "video/mp4"
            | "video/webm"
            | "application/pdf"
    )
}
pub(crate) async fn handle(
    State(state): State<ServerState>,
    method: Method,
    uri: Uri,
    request: HeaderMap,
) -> Response {
    let origin = request.get("origin").and_then(|v| v.to_str().ok());
    let mut output = headers(origin.filter(|v| *v == state.origin));
    if state.cancellation.is_cancelled() {
        return response(410, output, Body::empty());
    }
    if request.get("host").and_then(|v| v.to_str().ok()) != Some(state.authority.as_str())
        || (request.contains_key("origin") && origin != Some(state.origin.as_str()))
    {
        return response(403, output, Body::empty());
    }
    if uri.query().is_some() {
        return response(404, output, Body::empty());
    }
    let parts: Vec<_> = uri.path().split('/').collect();
    let valid_token = parts
        .get(1)
        .is_some_and(|value| bool::from(value.as_bytes().ct_eq(state.token.as_bytes())));
    if !valid_token {
        return response(404, output, Body::empty());
    }
    let tile = parts.get(2) == Some(&"tile") && parts.len() == 7;
    let object = parts.get(2) == Some(&"object") && parts.len() == 4;
    let Some(original) = parts.get(3).filter(|s| id(s)) else {
        return response(404, output, Body::empty());
    };
    if !object && !tile {
        return response(404, output, Body::empty());
    }
    if !matches!(method, Method::GET | Method::HEAD | Method::OPTIONS) {
        output.insert("allow", HeaderValue::from_static("GET, HEAD, OPTIONS"));
        return response(405, output, Body::empty());
    }
    let metadata = match state.backend.info(original).await {
        Ok(info) => info,
        Err(_) => return response(404, output, Body::empty()),
    };
    if method == Method::OPTIONS {
        let requested = request
            .get("access-control-request-method")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("GET");
        let safe_headers = request
            .get("access-control-request-headers")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(',')
            .all(|h| h.trim().is_empty() || h.trim().eq_ignore_ascii_case("range"));
        if !matches!(requested, "GET" | "HEAD") || !safe_headers {
            return response(403, output, Body::empty());
        }
        output.insert(
            "access-control-allow-methods",
            HeaderValue::from_static("GET, HEAD"),
        );
        output.insert(
            "access-control-allow-headers",
            HeaderValue::from_static("Range"),
        );
        return response(204, output, Body::empty());
    }
    let mut object_id = original.to_string();
    let mut metadata = metadata;
    if tile {
        let coords: Option<Vec<u32>> = parts[4..]
            .iter()
            .map(|v| {
                if *v != "0" && v.starts_with('0') {
                    None
                } else {
                    v.parse().ok()
                }
            })
            .collect();
        let Some(coords) = coords else {
            return response(404, output, Body::empty());
        };
        object_id = match state
            .backend
            .tile(original, coords[0], coords[1], coords[2])
            .await
        {
            Ok(Some(value)) => value,
            _ => return response(404, output, Body::empty()),
        };
        metadata = match state.backend.info(&object_id).await {
            Ok(info) => info,
            Err(_) => return response(404, output, Body::empty()),
        };
        metadata.mime_type = "image/webp".into();
    }
    let mime = if allowed_mime(&metadata.mime_type) {
        metadata.mime_type.as_str()
    } else {
        output.insert(
            "content-disposition",
            HeaderValue::from_static("attachment"),
        );
        "application/octet-stream"
    };
    output.insert(
        "content-type",
        HeaderValue::from_str(mime).unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    let mut range = ByteRange {
        offset: 0,
        length: metadata.byte_length,
    };
    let mut status = 200;
    if method == Method::GET && request.contains_key("range") {
        match request
            .get("range")
            .and_then(|v| v.to_str().ok())
            .ok_or(400)
            .and_then(|v| parse_range(v, metadata.byte_length))
        {
            Ok(value) => {
                range = value;
                status = 206;
                output.insert(
                    "content-range",
                    HeaderValue::from_str(&format!(
                        "bytes {}-{}/{}",
                        range.offset,
                        range.offset + range.length - 1,
                        metadata.byte_length
                    ))
                    .unwrap(),
                );
            }
            Err(code) => {
                if code == 416 {
                    output.insert(
                        "content-range",
                        HeaderValue::from_str(&format!("bytes */{}", metadata.byte_length))
                            .unwrap(),
                    );
                }
                return response(code, output, Body::empty());
            }
        }
    }
    output.insert(
        "content-length",
        HeaderValue::from_str(&range.length.to_string()).unwrap(),
    );
    let body = if method == Method::HEAD || range.length == 0 {
        Body::empty()
    } else {
        Body::from_stream(resource_stream(
            state.backend,
            object_id,
            range.offset,
            range.length,
            state.cancellation,
        ))
    };
    response(status, output, body)
}
