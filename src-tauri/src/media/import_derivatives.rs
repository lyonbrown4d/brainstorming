use super::{Importer, Result, derivative_cache::PIPELINE_VERSION, vips};
use crate::document::{Derivatives, Preview, ResourceObject, Tile};
use serde_json::{Value, json};

impl Importer {
    /// Import all outputs and close plaintext temporary files before any result
    /// becomes cacheable. The cache contains neither these paths nor tile bytes.
    pub(super) async fn storage(
        &self,
        object: &ResourceObject,
        image: Option<vips::Artifacts>,
    ) -> Result<Value> {
        let mut storage = json!({"objectId":object.object_id,"byteLength":object.byte_length});
        if let Some(image) = image {
            let preview = self
                .state
                .vault
                .import_file(&image.preview)
                .await
                .map_err(|e| e.to_string())?;
            let mut derivatives = Derivatives {
                preview: Some(Preview {
                    object_id: preview.object_id.clone(),
                    mime_type: "image/webp".into(),
                    width: image.preview_width,
                    height: image.preview_height,
                }),
                tiles: Vec::new(),
            };
            for (level, x, y, path) in image.tiles {
                let tile = self
                    .state
                    .vault
                    .import_file(&path)
                    .await
                    .map_err(|e| e.to_string())?;
                derivatives.tiles.push(Tile {
                    object_id: tile.object_id,
                    level,
                    x,
                    y,
                });
            }
            self.state
                .vault
                .set_derivatives(&object.object_id, derivatives)
                .await
                .map_err(|e| e.to_string())?;
            storage["width"] = json!(image.width);
            storage["height"] = json!(image.height);
            storage["preview"] = json!({"objectId":preview.object_id,"byteLength":preview.byte_length,
                "mimeType":"image/webp","width":image.preview_width,"height":image.preview_height});
            storage["tiles"] = json!({"tileSize":512,"overlap":1,"maxLevel":u32::BITS-(image.width.max(image.height)-1).leading_zeros(),
                "width":image.width,"height":image.height,"format":"webp","pipelineVersion":PIPELINE_VERSION});
            image.directory.close().await?;
        }
        Ok(storage)
    }
    /// Authorization is performed anew for every import, including cache hits.
    /// Individual tile authorization remains the catalog's indexed lookup job.
    pub(super) async fn asset(
        &self,
        object: &ResourceObject,
        name: &str,
        mime: &str,
        storage: Value,
    ) -> Result<Value> {
        if let Some(id) = storage["preview"]["objectId"].as_str() {
            let preview = self
                .state
                .vault
                .object_info(id)
                .await
                .map_err(|e| e.to_string())?;
            self.catalog
                .register_vault(id, preview.byte_length, "image/webp")
                .await;
        }
        self.catalog
            .register_vault(&object.object_id, object.byte_length, mime)
            .await;
        Ok(
            json!({"id":uuid::Uuid::new_v4().to_string(),"name":crate::runtime::input::safe_name(name),"mimeType":mime,"storage":storage}),
        )
    }
}
