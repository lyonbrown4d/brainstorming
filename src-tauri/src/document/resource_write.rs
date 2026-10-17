use super::{
    Result,
    error::invalid,
    resources::{self, Derivatives, Preview, ResourceSource},
    validation::*,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use sqlx::SqliteConnection;
use std::io::Cursor;

pub(crate) async fn normalize(
    db: &mut SqliteConnection,
    workbook: &mut Value,
    source: Option<&dyn ResourceSource>,
) -> Result<()> {
    let sheets = workbook["sheets"]
        .as_array_mut()
        .ok_or_else(|| invalid("画布列表无效"))?;
    for sheet in sheets {
        let mut referenced = std::collections::HashSet::new();
        let mut image_dimensions = std::collections::HashMap::new();
        for topic in object(&sheet["document"]["topics"])?.values() {
            if let Some(image) = topic.get("image") {
                image_dimensions
                    .entry(text(&image["assetId"])?.to_owned())
                    .or_insert_with(Vec::new)
                    .push((
                        integer(&image["width"], 1, 65_536)?,
                        integer(&image["height"], 1, 65_536)?,
                    ));
            }
            for (id, _, _) in super::content_validation::references(topic)? {
                referenced.insert(id);
            }
        }
        let Some(assets) = sheet
            .get_mut("document")
            .and_then(|doc| doc.get_mut("assets"))
            .and_then(Value::as_object_mut)
        else {
            continue;
        };
        assets.retain(|id, _| referenced.contains(id));
        for asset in assets.values_mut() {
            if let Some(data) = asset.get("data") {
                let bytes = STANDARD
                    .decode(text(data)?)
                    .map_err(|_| invalid("资源 base64 编码无效"))?;
                if bytes.len() > 8 * 1024 * 1024 {
                    return Err(invalid("内联资源超过 8 MiB"));
                }
                let dimensions = super::inline_validation::validate(asset, &bytes)?;
                if let Some(expected) = image_dimensions.get(text(&asset["id"])?)
                    && expected
                        .iter()
                        .any(|expected| Some(*expected) != dimensions)
                {
                    return Err(invalid("主题图片尺寸与实际内容不一致"));
                }
                let object = resources::insert(db, &mut Cursor::new(bytes), None).await?;
                asset.as_object_mut().unwrap().remove("data");
                asset["storage"] = serde_json::to_value(object)?;
                if let Some((width, height)) = dimensions {
                    asset["storage"]["width"] = json!(width);
                    asset["storage"]["height"] = json!(height);
                }
            }
            let storage = &asset["storage"];
            let oid = text(&storage["objectId"])?;
            let length = integer(&storage["byteLength"], 0, resources::MAX_OBJECT_BYTES)?;
            ensure(db, oid, length, source).await?;
            let mut derivatives = if let Some(source) = source {
                source.derivatives(oid).await?
            } else {
                Derivatives::default()
            };
            if let Some(preview) = storage.get("preview") {
                let pid = text(&preview["objectId"])?;
                let size = integer(&preview["byteLength"], 0, resources::MAX_RANGE_BYTES)?;
                ensure(db, pid, size, source).await?;
                derivatives.preview = Some(Preview {
                    object_id: pid.to_owned(),
                    mime_type: text(&preview["mimeType"])?.to_owned(),
                    width: integer(&preview["width"], 1, 65_536)? as u32,
                    height: integer(&preview["height"], 1, 65_536)? as u32,
                });
            }
            if let Some(source) = source {
                if let Some(preview) = &derivatives.preview
                    && resources::size(db, &preview.object_id).await.is_err()
                {
                    let mut reader = source.open(&preview.object_id).await?;
                    let object = resources::insert(db, &mut reader, None).await?;
                    drop(reader);
                    if object.object_id != preview.object_id {
                        return Err(invalid("预览资源摘要不一致"));
                    }
                }
                for tile in &derivatives.tiles {
                    if resources::size(db, &tile.object_id).await.is_ok() {
                        continue;
                    }
                    let mut reader = source.open(&tile.object_id).await?;
                    let object = resources::insert(db, &mut reader, None).await?;
                    drop(reader);
                    if object.object_id != tile.object_id {
                        return Err(invalid("瓦片资源摘要不一致"));
                    }
                }
            }
            resources::link_derivatives(db, oid, &derivatives).await?;
            if let Some(preview) = derivatives.preview {
                asset["storage"]["preview"] = json!({"objectId":preview.object_id,"mimeType":preview.mime_type,"width":preview.width,"height":preview.height,"byteLength":resources::size(db,&preview.object_id).await?});
            }
        }
    }
    Ok(())
}

async fn ensure(
    db: &mut SqliteConnection,
    id: &str,
    length: u64,
    source: Option<&dyn ResourceSource>,
) -> Result<()> {
    if let Ok(existing) = resources::size(db, id).await {
        if existing != length {
            return Err(invalid("资源对象长度不一致"));
        }
        return Ok(());
    }
    let source = source.ok_or_else(|| invalid("资源对象来源不可用"))?;
    let mut reader = source.open(id).await?;
    resources::insert(db, &mut reader, Some((id, length))).await?;
    Ok(())
}
