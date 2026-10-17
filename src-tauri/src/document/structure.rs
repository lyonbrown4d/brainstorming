use super::{Result, content_validation::references, validation::*};
use serde_json::{Value, json};
use sqlx::{AssertSqlSafe, SqliteConnection};
use std::collections::HashMap;

pub(crate) async fn replace(db: &mut SqliteConnection, workbook: &Value) -> Result<()> {
    for table in [
        "document",
        "sheets",
        "topics",
        "annotations",
        "group_members",
        "resources",
        "topic_resources",
    ] {
        // The interpolated identifier comes only from the fixed table list above.
        sqlx::query(AssertSqlSafe(format!("DELETE FROM {table}")))
            .execute(&mut *db)
            .await?;
    }
    sqlx::query("INSERT INTO document VALUES (?1,?2,2,?3)")
        .bind(text(&workbook["id"])?)
        .bind(text(&workbook["title"])?)
        .bind("[\"ordered-topics\",\"chunked-resources\",\"native-rust-v2\"]")
        .execute(&mut *db)
        .await?;
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
        sqlx::query("INSERT INTO sheets VALUES (?1,?2,?3,?4,?5,?6,?7)")
            .bind(sid)
            .bind(position as i64)
            .bind(text(&doc["id"])?)
            .bind(text(&sheet["name"])?)
            .bind(text(&doc["title"])?)
            .bind(text(&doc["rootId"])?)
            .bind(serde_json::to_string(&metadata)?)
            .execute(&mut *db)
            .await?;
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
            sqlx::query("INSERT INTO topics VALUES (?1,?2,?3,?4,?5)")
                .bind(sid)
                .bind(tid)
                .bind(parent.map(|p| p.0))
                .bind(parent.map_or(0, |p| p.1) as i64)
                .bind(serde_json::to_string(&data)?)
                .execute(&mut *db)
                .await?;
            for (asset, role, position) in references(topic)? {
                sqlx::query("INSERT INTO topic_resources VALUES (?1,?2,?3,?4,?5)")
                    .bind(sid)
                    .bind(tid)
                    .bind(asset)
                    .bind(role)
                    .bind(position as i64)
                    .execute(&mut *db)
                    .await?;
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
                            sqlx::query("INSERT INTO group_members VALUES (?1,?2,?3,?4)")
                                .bind(sid)
                                .bind(annotation_id)
                                .bind(text(topic)?)
                                .bind(index as i64)
                                .execute(&mut *db)
                                .await?;
                        }
                    }
                    sqlx::query("INSERT INTO annotations VALUES (?1,?2,?3,?4,?5)")
                        .bind(sid)
                        .bind(kind)
                        .bind(position as i64)
                        .bind(annotation_id)
                        .bind(serde_json::to_string(&data)?)
                        .execute(&mut *db)
                        .await?;
                }
            }
        }
        if let Some(assets) = doc["assets"].as_object() {
            for (aid, asset) in assets {
                sqlx::query("INSERT INTO resources VALUES (?1,?2,?3,?4,?5,?6)")
                    .bind(sid)
                    .bind(aid)
                    .bind(text(&asset["storage"]["objectId"])?)
                    .bind(text(&asset["name"])?)
                    .bind(text(&asset["mimeType"])?)
                    .bind(serde_json::to_string(&asset["storage"])?)
                    .execute(&mut *db)
                    .await?;
            }
        }
    }
    Ok(())
}

pub(crate) use super::structure_read::read;
