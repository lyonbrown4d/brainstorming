use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentIndexWorkbook {
    pub workbook_id: String,
    pub title: String,
    pub topics: Vec<ContentIndexTopic>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentIndexTopic {
    pub sheet_id: String,
    pub sheet_name: String,
    pub topic_id: String,
    pub title: String,
    pub notes: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncContentIndex {
    pub upserts: Vec<ContentIndexWorkbook>,
    pub retained_workbook_ids: Vec<String>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchContent {
    pub query: String,
    pub limit: Option<u32>,
}
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContentSearchResult {
    pub workbook_id: String,
    pub workbook_title: String,
    pub sheet_id: String,
    pub sheet_name: String,
    pub topic_id: String,
    pub title: String,
    pub snippet: String,
}
