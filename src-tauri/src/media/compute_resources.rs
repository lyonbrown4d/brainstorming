pub use crate::document_exports::assets::hydrate;

#[cfg(test)]
mod tests {
  use super::*;
  use crate::media::catalog::Catalog;
  use crate::{application::Backend, document_fixture as fixture};
  use base64::{Engine, engine::general_purpose::STANDARD};
  use serde_json::json;
  use std::sync::Arc;

  #[tokio::test]
  async fn hydrates_one_sheet_when_another_has_no_assets() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Backend::start(directory.path().join("state"), None)
      .await
      .unwrap();
    let image = STANDARD
      .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")
      .unwrap();
    let stored = backend
      .state
      .vault
      .import_bytes(image.clone())
      .await
      .unwrap();
    let catalog = Arc::new(Catalog::new(backend.state.clone()));
    catalog
      .register_vault(&stored.object_id, stored.byte_length, "image/png")
      .await;
    let mut workbook = fixture::workbook();
    workbook["sheets"][0]["document"]["topics"]["root"]["image"] =
      json!({"assetId":"image","width":1,"height":1});
    workbook["sheets"][0]["document"]["assets"] = json!({"image":{
      "id":"image","name":"image.png","mimeType":"image/png",
      "storage":{"objectId":stored.object_id,"byteLength":stored.byte_length}
    }});
    workbook["sheets"][1]["document"]
      .as_object_mut()
      .unwrap()
      .remove("assets");
    let hydrated = hydrate(catalog.as_ref(), workbook, false).await.unwrap();
    assert_eq!(
      hydrated["sheets"][0]["document"]["assets"]["image"]["data"],
      STANDARD.encode(image)
    );
    assert!(hydrated["sheets"][1]["document"].get("assets").is_none());
    backend.shutdown().await.unwrap();
  }
}
