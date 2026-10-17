use super::{Result, error::invalid, structure_read_parts::*, validation::*};
use serde_json::{Value, json};
use sqlx::{AssertSqlSafe, SqliteConnection};

pub(crate) async fn read(db: &mut SqliteConnection) -> Result<Value> {
    let totals: (i64, i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM sheets),(SELECT count(*) FROM topics),(SELECT count(*) FROM annotations),(SELECT COALESCE(sum(length(data)),0) FROM topics)+(SELECT COALESCE(sum(length(data)),0) FROM annotations)+(SELECT COALESCE(sum(length(metadata)),0) FROM sheets)+(SELECT COALESCE(sum(length(metadata)),0) FROM resources)")
        .fetch_one(&mut *db)
        .await?;
    if totals.0 > 128 || totals.1 > 20_000 || totals.2 > 2_048_000 || totals.3 > 128 * 1024 * 1024 {
        return Err(invalid("原生文档结构超过限制"));
    }
    let docs: Vec<(String, String, i64, String)> =
        sqlx::query_as("SELECT id,title,protocol,required_features FROM document")
            .fetch_all(&mut *db)
            .await?;
    if docs.len() != 1 || docs[0].2 != 2 {
        return Err(invalid("原生工作簿缺失或协议无效"));
    }
    let features: Vec<String> = serde_json::from_str(&docs[0].3)?;
    if features
        .iter()
        .any(|f| !["ordered-topics", "chunked-resources", "native-rust-v2"].contains(&f.as_str()))
    {
        return Err(invalid("原生文档要求当前版本不支持的能力"));
    }
    let sheets: Vec<(String, i64, String, String, String, String, String)> = sqlx::query_as(
        "SELECT id,position,document_id,name,title,root_id,metadata FROM sheets ORDER BY position",
    )
    .fetch_all(&mut *db)
    .await?;
    let mut result = Vec::new();
    for (index, (sid, position, did, name, title, root, metadata)) in sheets.into_iter().enumerate()
    {
        if position != index as i64 {
            return Err(invalid("画布顺序无效"));
        }
        let mut doc: Value = serde_json::from_str(&metadata)?;
        let arrays = doc
            .get("arrays")
            .cloned()
            .ok_or_else(|| invalid("画布扩展元数据缺失"))?;
        let had_assets = doc["assets"]
            .as_bool()
            .ok_or_else(|| invalid("画布资源元数据无效"))?;
        let map = doc
            .as_object_mut()
            .ok_or_else(|| invalid("画布元数据无效"))?;
        map.remove("arrays");
        map.remove("assets");
        for key in [
            "format",
            "version",
            "id",
            "title",
            "rootId",
            "topics",
            "relations",
            "groups",
            "callouts",
            "presentation",
        ] {
            if map.contains_key(key) {
                return Err(invalid("画布元数据包含保留字段"));
            }
        }
        map.extend(
            object(
                &json!({"format":"brainstorming","version":1,"id":did,"title":title,"rootId":root}),
            )?
            .clone(),
        );
        doc["topics"] = read_topics(db, &sid, &root).await?;
        for kind in ["relations", "groups", "callouts", "presentation"] {
            let items = read_annotations(db, &sid, kind).await?;
            match arrays[kind].as_bool() {
                Some(true) => doc[kind] = Value::Array(items),
                Some(false) if items.is_empty() => (),
                _ => return Err(invalid("批注存在性标记无效")),
            }
        }
        let assets = read_assets(db, &sid).await?;
        if had_assets {
            doc["assets"] = Value::Object(assets);
        } else if !assets.is_empty() {
            return Err(invalid("资源存在性标记无效"));
        }
        result.push(json!({"id":sid,"name":name,"document":doc}));
    }
    for table in [
        "topics",
        "annotations",
        "group_members",
        "resources",
        "topic_resources",
    ] {
        // The interpolated identifier comes only from the fixed table list above.
        let invalid_rows: i64 = sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT count(*) FROM {table} WHERE sheet_id NOT IN (SELECT id FROM sheets)"
        )))
        .fetch_one(&mut *db)
        .await?;
        if invalid_rows != 0 {
            return Err(invalid("原生文档包含孤立画布数据"));
        }
    }
    let broken: i64 = sqlx::query_scalar("SELECT (SELECT count(*) FROM annotations WHERE kind NOT IN ('relations','groups','callouts','presentation'))+(SELECT count(*) FROM group_members m WHERE NOT EXISTS (SELECT 1 FROM annotations a WHERE a.sheet_id=m.sheet_id AND a.kind='groups' AND a.id=m.group_id))+(SELECT count(*) FROM resource_variants v WHERE NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=v.object_id) OR NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=v.variant_object_id))+(SELECT count(*) FROM image_tiles t WHERE NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=t.object_id) OR NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=t.tile_object_id))")
        .fetch_one(&mut *db)
        .await?;
    if broken != 0 {
        return Err(invalid("文档包含不支持的批注或损坏的资源引用"));
    }
    let workbook = json!({"format":"brainstorming","version":2,"id":docs[0].0,"title":docs[0].1,"sheets":result});
    validate_workbook(&workbook)?;
    verify_references(db, &workbook).await?;
    Ok(workbook)
}
