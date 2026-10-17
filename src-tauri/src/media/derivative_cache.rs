//! Only completed vault storage metadata is reusable. Object permissions and
//! temporary/native image buffers always remain outside this per-importer cache.
use moka::future::Cache;
use serde_json::Value;
use std::time::Duration;

pub(super) const PIPELINE_VERSION: u32 = 1;
const CAPACITY: u64 = 256;
const TTL: Duration = Duration::from_secs(30 * 60);
// Keep this signature aligned with vips.rs whenever fixed processing options change.
const PARAMETERS: &str = "autorot;sequential;fail-on=warning;preview=1600x1600-inside-no-upscale-webp-q82-effort4;deepzoom=512-overlap1-onepixel-alltiles-webp-q88-effort4";

#[derive(Clone, Hash, PartialEq, Eq)]
struct Key {
    original_sha256: String,
    pipeline_version: u32,
    parameters: &'static str,
}
impl Key {
    fn new(object_id: &str) -> Self {
        Self {
            original_sha256: object_id.into(),
            pipeline_version: PIPELINE_VERSION,
            parameters: PARAMETERS,
        }
    }
}
pub(super) struct DerivativeCache(Cache<Key, Value>);
impl Default for DerivativeCache {
    fn default() -> Self {
        Self(
            Cache::builder()
                .max_capacity(CAPACITY)
                .time_to_live(TTL)
                .build(),
        )
    }
}
impl DerivativeCache {
    pub async fn get(&self, object_id: &str) -> Option<Value> {
        self.0.get(&Key::new(object_id)).await
    }
    pub async fn insert(&self, object_id: &str, storage: Value) {
        self.0.insert(Key::new(object_id), storage).await;
    }
}
