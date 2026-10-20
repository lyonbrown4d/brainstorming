//! Named JSON recursion keeps Specta from expanding serde_json::Value indefinitely.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Deserialize, Serialize, specta::Type)]
#[serde(untagged)]
pub enum WireValue {
  Null(()),
  Bool(bool),
  Number(f64),
  String(String),
  Array(Vec<WireValue>),
  Object(BTreeMap<String, WireValue>),
}

#[derive(Deserialize, Serialize)]
#[serde(transparent)]
pub struct JsonValue(pub Value);

impl specta::Type for JsonValue {
  fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
    WireValue::definition(types)
  }
}
