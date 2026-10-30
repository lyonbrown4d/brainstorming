#[path = "document_fixture.rs"]
mod fixture;
use brainstorming_engine::document::{DocumentStore, validate_workbook};
use serde_json::json;

#[test]
fn validates_all_nine_priorities_without_implicit_task_status() {
  let mut workbook = fixture::workbook();
  for priority in 1..=9 {
    workbook["sheets"][0]["document"]["topics"]["a"]["metadata"]["task"] =
      json!({ "priority": priority });
    assert!(validate_workbook(&workbook).is_ok());
  }
  for priority in [json!(0), json!(10), json!(1.5), json!("9")] {
    workbook["sheets"][0]["document"]["topics"]["a"]["metadata"]["task"] =
      json!({ "priority": priority });
    assert!(validate_workbook(&workbook).is_err());
  }
  workbook["sheets"][0]["document"]["topics"]["a"]["metadata"]["task"] =
    json!({ "priority": 9, "done": "false" });
  assert!(validate_workbook(&workbook).is_err());
}

#[tokio::test]
async fn priority_only_metadata_survives_sqlite_save_and_reopen() {
  let folder = tempfile::tempdir().unwrap();
  let path = folder.path().join("priority.brainstorming");
  let mut workbook = fixture::workbook();
  workbook["sheets"][0]["document"]["topics"]["a"]["metadata"]["task"] = json!({ "priority": 9 });
  let store = DocumentStore::new();
  store
    .write(&path, workbook, None, None, None)
    .await
    .unwrap();
  store.release(&path).await.unwrap();
  let reopened = store.read(&path, None).await.unwrap();
  assert_eq!(
    reopened["sheets"][0]["document"]["topics"]["a"]["metadata"]["task"],
    json!({ "priority": 9 })
  );
  store.release(&path).await.unwrap();
}
