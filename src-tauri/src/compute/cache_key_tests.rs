use super::{INPUT_LIMIT, cache_key};
use serde::{Serialize, Serializer, ser::SerializeSeq};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::cell::Cell;

#[test]
fn hashes_exact_json_bytes_for_unicode_escapes_and_structured_inputs() {
  let fixtures = [
    json!({"标题": "中文 🧠 café", "escaped": "\"\\\n\t\r\u{0000}\u{001f}", "empty": ""}),
    json!([null, true, false, -42, 1.25, [], {}, {"b": 2, "a": 1}]),
    json!({"nested": [{"text": "x".repeat(100_000)}, [1, 2, 3]]}),
  ];
  for fixture in fixtures {
    let previous: [u8; 32] = Sha256::digest(serde_json::to_vec(&fixture).unwrap()).into();
    assert_eq!(cache_key(&fixture).unwrap(), previous);
  }
  let tuple = (&fixtures_document(), vec![1.25_f64, -0.0, 1e20]);
  let previous: [u8; 32] = Sha256::digest(serde_json::to_vec(&tuple).unwrap()).into();
  assert_eq!(cache_key(&tuple).unwrap(), previous);
}

fn fixtures_document() -> serde_json::Value {
  json!({"title": "root", "children": ["孩子", "quoted \"title\""]})
}

#[test]
fn accepts_exact_64_mib_and_rejects_the_next_json_byte() {
  // JSON adds two quote bytes; stream the reference digest without a second large Vec.
  let mut text = "a".repeat(INPUT_LIMIT - 2);
  let mut expected = Sha256::new();
  expected.update(b"\"");
  expected.update(text.as_bytes());
  expected.update(b"\"");
  let expected: [u8; 32] = expected.finalize().into();
  assert_eq!(cache_key(&text).unwrap(), expected);
  text.push('a');
  assert_eq!(cache_key(&text).unwrap_err(), "计算输入超过限制");
}

struct Invalid;
impl Serialize for Invalid {
  fn serialize<S: Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
    Err(serde::ser::Error::custom("invalid input"))
  }
}

#[test]
fn preserves_invalid_serialization_error() {
  assert_eq!(cache_key(&Invalid).unwrap_err(), "计算输入无效");
  assert_eq!(
    cache_key(&json!({})).unwrap(),
    Sha256::digest(b"{}").as_slice()
  );
}

struct EscapedSequence<'a> {
  visited: &'a Cell<usize>,
}
impl Serialize for EscapedSequence<'_> {
  fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
    let mut seq = serializer.serialize_seq(None)?;
    // Each control byte expands to six JSON bytes, despite the small source chunk.
    let chunk = "\u{0000}".repeat(4096);
    for _ in 0..20_000 {
      self.visited.set(self.visited.get() + 1);
      seq.serialize_element(&chunk)?;
    }
    seq.end()
  }
}

#[test]
fn stops_serialization_when_escaped_json_crosses_the_budget() {
  let visited = Cell::new(0);
  assert_eq!(
    cache_key(&EscapedSequence { visited: &visited }).unwrap_err(),
    "计算输入超过限制"
  );
  // A complete serialization would emit over 468 MiB; rejection stops near 64 MiB.
  assert_eq!(visited.get(), (INPUT_LIMIT - 1) / (4096 * 6 + 3) + 1);
}
