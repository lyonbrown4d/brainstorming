use brainstorming_native::transport::{
    ObjectInfo, ReadFuture, ResourceBackend, ResourceServer, parse_range, resource_stream,
};
use futures_util::StreamExt;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio_util::sync::CancellationToken;
const ID: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
struct Fixture {
    bytes: Vec<u8>,
    reads: Mutex<Vec<(u64, u64)>>,
}
impl ResourceBackend for Fixture {
    fn info<'a>(&'a self, id: &'a str) -> ReadFuture<'a, ObjectInfo> {
        Box::pin(async move {
            if id != ID {
                return Err("unauthorized".into());
            }
            Ok(ObjectInfo {
                byte_length: self.bytes.len() as u64,
                mime_type: "video/mp4".into(),
            })
        })
    }
    fn read<'a>(&'a self, id: &'a str, offset: u64, length: u64) -> ReadFuture<'a, Vec<u8>> {
        Box::pin(async move {
            if id != ID {
                return Err("unauthorized".into());
            }
            self.reads.lock().unwrap().push((offset, length));
            Ok(self.bytes[offset as usize..(offset + length) as usize].to_vec())
        })
    }
    fn tile<'a>(&'a self, _: &'a str, _: u32, _: u32, _: u32) -> ReadFuture<'a, Option<String>> {
        Box::pin(async { Ok(None) })
    }
}
fn fixture() -> Arc<Fixture> {
    Arc::new(Fixture {
        bytes: (0..(1024 * 1024 + 17)).map(|i| (i % 251) as u8).collect(),
        reads: Mutex::new(Vec::new()),
    })
}
#[tokio::test]
async fn full_video_is_lazy_bounded_and_revocable() {
    let fixture = fixture();
    let cancel = CancellationToken::new();
    let stream = resource_stream(
        fixture.clone(),
        ID.into(),
        0,
        fixture.bytes.len() as u64,
        cancel.clone(),
    );
    futures_util::pin_mut!(stream);
    assert!(fixture.reads.lock().unwrap().is_empty());
    let first = stream.next().await.unwrap().unwrap();
    assert_eq!(first.len(), 256 * 1024);
    assert_eq!(first.as_ref(), &fixture.bytes[..256 * 1024]);
    assert_eq!(fixture.reads.lock().unwrap().len(), 1);
    cancel.cancel();
    assert!(stream.next().await.unwrap().is_err());
    assert_eq!(fixture.reads.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn http_ranges_origin_authorization_head_and_no_range_stream() {
    let fixture = fixture();
    let server = ResourceServer::start(fixture.clone(), "tauri://localhost".into())
        .await
        .unwrap();
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let url = format!("{}/object/{ID}", server.origin);
    let response = client
        .get(&url)
        .header("Origin", "tauri://localhost")
        .header("Range", "bytes=262140-262155")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 206);
    assert_eq!(
        response.headers()["content-range"],
        format!("bytes 262140-262155/{}", fixture.bytes.len())
    );
    assert_eq!(
        response.headers()["access-control-allow-origin"],
        "tauri://localhost"
    );
    assert_eq!(
        response.bytes().await.unwrap().as_ref(),
        &fixture.bytes[262140..262156]
    );
    assert_eq!(
        client
            .get(&url)
            .header("Origin", "https://evil.example")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        client
            .get(&url)
            .header("Range", "bytes=0-1,4-5")
            .send()
            .await
            .unwrap()
            .status(),
        416
    );
    assert_eq!(
        client
            .get(&url)
            .header("Range", "bytes=9999999-")
            .send()
            .await
            .unwrap()
            .status(),
        416
    );
    let reads = fixture.reads.lock().unwrap().len();
    let head = client
        .head(&url)
        .header("Range", "bytes=0-0")
        .send()
        .await
        .unwrap();
    assert_eq!(head.status(), 200);
    // Reqwest's content_length() reports the received body's size hint (zero
    // for HEAD). The wire header describes the corresponding GET representation.
    assert_eq!(
        head.headers()["content-length"],
        fixture.bytes.len().to_string()
    );
    assert!(!head.headers().contains_key("content-range"));
    assert!(head.bytes().await.unwrap().is_empty());
    assert_eq!(fixture.reads.lock().unwrap().len(), reads);
    let full = client
        .get(&url)
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();
    assert_eq!(full.as_ref(), fixture.bytes.as_slice());
    assert!(
        fixture
            .reads
            .lock()
            .unwrap()
            .iter()
            .all(|(_, n)| *n <= 256 * 1024)
    );
    let wrong = url.replace(ID, &"b".repeat(64));
    assert_eq!(client.get(wrong).send().await.unwrap().status(), 404);
    let wrong_token = url.replace(server.origin.rsplit('/').next().unwrap(), "wrong");
    assert_eq!(client.get(wrong_token).send().await.unwrap().status(), 404);
    server.revoke();
    tokio::time::timeout(Duration::from_secs(2), server.shutdown())
        .await
        .unwrap();
}
#[test]
fn suffix_and_open_ranges_are_single_and_bounded() {
    let range = parse_range("bytes=-10", 100).unwrap();
    assert_eq!((range.offset, range.length), (90, 10));
    let range = parse_range("bytes=95-", 100).unwrap();
    assert_eq!((range.offset, range.length), (95, 5));
    assert_eq!(parse_range("bytes=100-", 100).unwrap_err(), 416);
    assert_eq!(parse_range("items=0-1", 100).unwrap_err(), 416);
    assert_eq!(parse_range("bytes=", 100).unwrap_err(), 400);
    assert_eq!(parse_range("bytes=-10", 0).unwrap_err(), 416);
    assert_eq!(parse_range("bytes=0-", 0).unwrap_err(), 416);
}
