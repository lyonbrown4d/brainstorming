use super::{Result, content_validation::references, validation::*};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::collections::HashMap;

pub(crate) fn replace(db: &Connection, workbook: &Value) -> Result<()> {
    for table in [
        "document",
        "sheets",
        "topics",
        "annotations",
        "group_members",
        "resources",
        "topic_resources",
    ] {
        db.execute(&format!("DELETE FROM {table}"), [])?;
    }
    db.execute(
        "INSERT INTO document VALUES (?1,?2,2,?3)",
        params![
            text(&workbook["id"])?,
            text(&workbook["title"])?,
            "[\"ordered-topics\",\"chunked-resources\",\"native-rust-v2\"]"
        ],
    )?;
    for (position, sheet) in list(&workbook["sheets"], 128)?.iter().enumerate() {
        let sid = text(&sheet["id"])?;
        let doc = &sheet["document"];
        let mut metadata = object(doc)?.clone();
        for key in [
            "format",
            "version",
            "id",
            "title",
            "rootId",
            "topics",
            "assets",
            "relations",
            "groups",
            "callouts",
            "presentation",
        ] {
            metadata.remove(key);
        }
        metadata.insert("arrays".into(), json!({"relations":doc.get("relations").is_some(),"groups":doc.get("groups").is_some(),"callouts":doc.get("callouts").is_some(),"presentation":doc.get("presentation").is_some()}));
        metadata.insert("assets".into(), json!(doc.get("assets").is_some()));
        db.execute(
            "INSERT INTO sheets VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                sid,
                position as i64,
                text(&doc["id"])?,
                text(&sheet["name"])?,
                text(&doc["title"])?,
                text(&doc["rootId"])?,
                serde_json::to_string(&metadata)?
            ],
        )?;
        let topics = object(&doc["topics"])?;
        let mut parents = HashMap::new();
        for (parent, topic) in topics {
            for (position, child) in list(&topic["children"], 20_000)?.iter().enumerate() {
                parents.insert(text(child)?, (parent.as_str(), position));
            }
        }
        for (tid, topic) in topics {
            let mut data = object(topic)?.clone();
            data.remove("children");
            let parent = parents.get(tid.as_str());
            db.execute(
                "INSERT INTO topics VALUES (?1,?2,?3,?4,?5)",
                params![
                    sid,
                    tid,
                    parent.map(|p| p.0),
                    parent.map_or(0, |p| p.1) as i64,
                    serde_json::to_string(&data)?
                ],
            )?;
            for (asset, role, position) in references(topic)? {
                db.execute(
                    "INSERT INTO topic_resources VALUES (?1,?2,?3,?4,?5)",
                    params![sid, tid, asset, role, position as i64],
                )?;
            }
        }
        for kind in ["relations", "groups", "callouts", "presentation"] {
            if let Some(items) = doc[kind].as_array() {
                for (position, item) in items.iter().enumerate() {
                    let mut data = object(item)?.clone();
                    let annotation_id = item["id"].as_str().unwrap_or("");
                    if kind == "groups" {
                        data.remove("topicIds");
                        for (index, topic) in list(&item["topicIds"], 20_000)?.iter().enumerate() {
                            db.execute(
                                "INSERT INTO group_members VALUES (?1,?2,?3,?4)",
                                params![sid, annotation_id, text(topic)?, index as i64],
                            )?;
                        }
                    }
                    db.execute(
                        "INSERT INTO annotations VALUES (?1,?2,?3,?4,?5)",
                        params![
                            sid,
                            kind,
                            position as i64,
                            annotation_id,
                            serde_json::to_string(&data)?
                        ],
                    )?;
                }
            }
        }
        if let Some(assets) = doc["assets"].as_object() {
            for (aid, asset) in assets {
                db.execute(
                    "INSERT INTO resources VALUES (?1,?2,?3,?4,?5,?6)",
                    params![
                        sid,
                        aid,
                        text(&asset["storage"]["objectId"])?,
                        text(&asset["name"])?,
                        text(&asset["mimeType"])?,
                        serde_json::to_string(&asset["storage"])?
                    ],
                )?;
            }
        }
    }
    Ok(())
}

pub(crate) use super::structure_read::read;
