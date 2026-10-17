use super::{Result, content_validation::references, error::invalid, validation::*};
use rusqlite::{Connection, params};
use serde_json::{Map, Value, json};
use std::collections::HashMap;

pub(crate) fn read(db: &Connection) -> Result<Value> {
    let totals: (i64,i64,i64,i64) = db.query_row("SELECT (SELECT count(*) FROM sheets),(SELECT count(*) FROM topics),(SELECT count(*) FROM annotations),(SELECT COALESCE(sum(length(data)),0) FROM topics)+(SELECT COALESCE(sum(length(data)),0) FROM annotations)+(SELECT COALESCE(sum(length(metadata)),0) FROM sheets)+(SELECT COALESCE(sum(length(metadata)),0) FROM resources)", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?;
    if totals.0 > 128 || totals.1 > 20_000 || totals.2 > 2_048_000 || totals.3 > 128 * 1024 * 1024 {
        return Err(invalid("原生文档结构超过限制"));
    }
    let mut rows = db.prepare("SELECT id,title,protocol,required_features FROM document")?;
    let docs = rows
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
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
    let mut query = db.prepare(
        "SELECT id,position,document_id,name,title,root_id,metadata FROM sheets ORDER BY position",
    )?;
    let sheets = query
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
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
        doc["topics"] = read_topics(db, &sid, &root)?;
        for kind in ["relations", "groups", "callouts", "presentation"] {
            let items = read_annotations(db, &sid, kind)?;
            match arrays[kind].as_bool() {
                Some(true) => doc[kind] = Value::Array(items),
                Some(false) if items.is_empty() => (),
                _ => return Err(invalid("批注存在性标记无效")),
            }
        }
        let assets = read_assets(db, &sid)?;
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
        let invalid_rows: i64 = db.query_row(
            &format!("SELECT count(*) FROM {table} WHERE sheet_id NOT IN (SELECT id FROM sheets)"),
            [],
            |r| r.get(0),
        )?;
        if invalid_rows != 0 {
            return Err(invalid("原生文档包含孤立画布数据"));
        }
    }
    let broken: i64 = db.query_row("SELECT (SELECT count(*) FROM annotations WHERE kind NOT IN ('relations','groups','callouts','presentation'))+(SELECT count(*) FROM group_members m WHERE NOT EXISTS (SELECT 1 FROM annotations a WHERE a.sheet_id=m.sheet_id AND a.kind='groups' AND a.id=m.group_id))+(SELECT count(*) FROM resource_variants v WHERE NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=v.object_id) OR NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=v.variant_object_id))+(SELECT count(*) FROM image_tiles t WHERE NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=t.object_id) OR NOT EXISTS (SELECT 1 FROM resource_objects o WHERE o.id=t.tile_object_id))",[],|r|r.get(0))?;
    if broken != 0 {
        return Err(invalid("文档包含不支持的批注或损坏的资源引用"));
    }
    let workbook = json!({"format":"brainstorming","version":2,"id":docs[0].0,"title":docs[0].1,"sheets":result});
    validate_workbook(&workbook)?;
    verify_references(db, &workbook)?;
    Ok(workbook)
}

fn read_topics(db: &Connection, sid: &str, root: &str) -> Result<Value> {
    let mut query = db.prepare(
        "SELECT id,parent_id,position,data FROM topics WHERE sheet_id=?1 ORDER BY position",
    )?;
    let rows = query
        .query_map([sid], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut topics = Map::new();
    let mut children: HashMap<String, Vec<Value>> = HashMap::new();
    for (tid, parent, position, data) in rows {
        let mut topic: Value = serde_json::from_str(&data)?;
        if topic["id"] != tid || topic.get("children").is_some() {
            return Err(invalid("主题标识或子节点存储无效"));
        }
        if let Some(parent) = parent {
            let siblings = children.entry(parent).or_default();
            if position != siblings.len() as i64 {
                return Err(invalid("主题顺序无效"));
            }
            siblings.push(json!(tid));
        } else if tid != root || position != 0 {
            return Err(invalid("主题根节点无效"));
        }
        topic["children"] = json!([]);
        topics.insert(tid, topic);
    }
    for (parent, ids) in children {
        topics
            .get_mut(&parent)
            .ok_or_else(|| invalid("主题父节点不存在"))?["children"] = Value::Array(ids);
    }
    Ok(Value::Object(topics))
}

fn read_annotations(db: &Connection, sid: &str, kind: &str) -> Result<Vec<Value>> {
    let mut query = db.prepare(
        "SELECT id,position,data FROM annotations WHERE sheet_id=?1 AND kind=?2 ORDER BY position",
    )?;
    let rows = query
        .query_map(params![sid, kind], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut items = Vec::new();
    for (annotation_id, position, data) in rows {
        if position != items.len() as i64 {
            return Err(invalid("批注顺序无效"));
        }
        let mut item: Value = serde_json::from_str(&data)?;
        if kind != "presentation" && item["id"] != annotation_id {
            return Err(invalid("批注标识无效"));
        }
        if kind == "groups" {
            let mut query=db.prepare("SELECT topic_id,position FROM group_members WHERE sheet_id=?1 AND group_id=?2 ORDER BY position")?;
            let rows = query
                .query_map(params![sid, annotation_id], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            let mut ids = Vec::new();
            for (id, position) in rows {
                if position != ids.len() as i64 {
                    return Err(invalid("分组成员顺序无效"));
                }
                ids.push(json!(id));
            }
            item["topicIds"] = Value::Array(ids);
        }
        items.push(item);
    }
    Ok(items)
}

fn read_assets(db: &Connection, sid: &str) -> Result<Map<String, Value>> {
    let mut query=db.prepare("SELECT r.id,r.object_id,r.name,r.mime_type,r.metadata,o.byte_length FROM resources r LEFT JOIN resource_objects o ON o.id=r.object_id WHERE sheet_id=?1")?;
    let rows = query
        .query_map([sid], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<u64>>(5)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut assets = Map::new();
    for (id, oid, name, mime, metadata, size) in rows {
        let storage: Value = serde_json::from_str(&metadata)?;
        if storage["objectId"] != oid || storage["byteLength"].as_u64() != size {
            return Err(invalid("资源对象缺失或长度无效"));
        }
        assets.insert(
            id.clone(),
            json!({"id":id,"name":name,"mimeType":mime,"storage":storage}),
        );
    }
    Ok(assets)
}

fn verify_references(db: &Connection, workbook: &Value) -> Result<()> {
    let mut expected = std::collections::HashSet::new();
    for sheet in list(&workbook["sheets"], 128)? {
        for (tid, topic) in object(&sheet["document"]["topics"])? {
            for (aid, role, position) in references(topic)? {
                expected.insert((
                    text(&sheet["id"])?.to_owned(),
                    tid.clone(),
                    aid,
                    role.to_owned(),
                    position as i64,
                ));
            }
        }
    }
    let mut query =
        db.prepare("SELECT sheet_id,topic_id,resource_id,role,position FROM topic_resources")?;
    let actual = query
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })?
        .collect::<std::result::Result<std::collections::HashSet<_>, _>>()?;
    if expected != actual {
        return Err(invalid("主题资源引用表与内容不一致"));
    }
    Ok(())
}
