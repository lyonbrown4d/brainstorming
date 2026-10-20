use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FindInput {
  pub workbook_id: String,
  pub query: String,
  #[serde(default)]
  pub match_case: bool,
  #[serde(default)]
  pub whole_word: bool,
  #[serde(default)]
  pub include_notes: bool,
  pub sheet_id: Option<String>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FindMatch {
  pub sheet_id: String,
  pub topic_id: String,
  pub field: &'static str,
  pub text: String,
  pub count: u32,
}
