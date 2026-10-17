use super::{Result, error::invalid, validation::*};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub(crate) fn references(topic: &Value) -> Result<Vec<(String, &'static str, usize)>> {
    let mut refs = Vec::new();
    if let Some(image) = topic.get("image") {
        keys(image, &["assetId", "width", "height"])?;
        let width = integer(&image["width"], 1, 65_536)?;
        let height = integer(&image["height"], 1, 65_536)?;
        if width * height > 268_402_689 {
            return Err(invalid("图片像素超过限制"));
        }
        refs.push((id(&image["assetId"])?.to_owned(), "image", 0));
    }
    if let Some(audio) = topic["metadata"].get("audioAssetId") {
        refs.push((id(audio)?.to_owned(), "audio", 0));
    }
    if let Some(attachments) = topic.get("attachments") {
        let mut unique = HashSet::new();
        for (position, asset) in list(attachments, 32)?.iter().enumerate() {
            let asset = id(asset)?;
            if !unique.insert(asset) {
                return Err(invalid("附件重复"));
            }
            refs.push((asset.to_owned(), "attachment", position));
        }
    }
    Ok(refs)
}

pub(crate) fn topic(topic: &Value, doc: &Value) -> Result<()> {
    super::presentation_validation::topic(topic)?;
    for (id, role, _) in references(topic)? {
        let asset = doc["assets"]
            .get(&id)
            .ok_or_else(|| invalid("主题引用的资源不存在"))?;
        let mime = text(&asset["mimeType"])?;
        if role == "image"
            && let (Some(width), Some(height)) = (
                asset["storage"]["width"].as_u64(),
                asset["storage"]["height"].as_u64(),
            )
            && (topic["image"]["width"].as_u64() != Some(width)
                || topic["image"]["height"].as_u64() != Some(height))
        {
            return Err(invalid("主题图片尺寸与原始资源尺寸不一致"));
        }
        if (role == "image"
            && ![
                "image/png",
                "image/jpeg",
                "image/gif",
                "image/webp",
                "image/tiff",
                "image/avif",
            ]
            .contains(&mime))
            || (role == "audio"
                && ![
                    "audio/mpeg",
                    "audio/wav",
                    "audio/ogg",
                    "audio/webm",
                    "audio/mp4",
                    "audio/aac",
                    "audio/flac",
                ]
                .contains(&mime))
        {
            return Err(invalid("主题资源 MIME 类型不受支持"));
        }
    }
    if let Some(style) = topic.get("style") {
        object(style)?;
    }
    if let Some(metadata) = topic.get("metadata") {
        keys(
            metadata,
            &[
                "labels",
                "markers",
                "markerStyle",
                "link",
                "task",
                "equation",
                "audioAssetId",
                "notesFormat",
                "richTitle",
            ],
        )?;
        for field in ["labels", "markers"] {
            if let Some(labels) = metadata.get(field) {
                let mut unique = HashSet::new();
                for label in list(labels, 32)? {
                    let label = text(label)?;
                    if label.encode_utf16().count() > 64 || !unique.insert(label) {
                        return Err(invalid("主题标签无效或重复"));
                    }
                }
            }
        }
        if let Some(link) = metadata.get("link") {
            if link["kind"] == "url" {
                keys(link, &["kind", "url"])?;
                let url = text(&link["url"])?;
                let parsed = url::Url::parse(url).map_err(|_| invalid("链接地址无效"))?;
                if url.chars().any(char::is_control)
                    || url.len() > 8192
                    || !["http", "https", "mailto"].contains(&parsed.scheme())
                {
                    return Err(invalid("链接协议不受支持"));
                }
            } else {
                keys(link, &["kind", "topicId", "sheetId"])?;
                if link["kind"] != "topic" {
                    return Err(invalid("主题链接类型无效"));
                }
                id(&link["topicId"])?;
            }
        }
        if let Some(task) = metadata.get("task") {
            keys(
                task,
                &[
                    "done",
                    "priority",
                    "progress",
                    "start",
                    "due",
                    "assignee",
                    "dependencies",
                ],
            )?;
            if !task["done"].is_boolean() {
                return Err(invalid("任务状态无效"));
            }
            if let Some(priority) = task.get("priority") {
                integer(priority, 1, 3)?;
            }
            if let Some(progress) = task.get("progress") {
                integer(progress, 0, 100)?;
            }
            if let (Some(start), Some(due)) = (task.get("start"), task.get("due"))
                && text(start)? > text(due)?
            {
                return Err(invalid("任务截止日期早于开始日期"));
            }
        }
    }
    Ok(())
}

pub(crate) fn extensions(doc: &Value) -> Result<()> {
    super::presentation_validation::settings(doc)?;
    let topics = object(&doc["topics"])?;
    let require = |value: &Value| -> Result<()> {
        if !topics.contains_key(id(value)?) {
            return Err(invalid("批注或任务引用的主题不存在"));
        }
        Ok(())
    };
    let mut annotation_ids = HashSet::new();
    for kind in ["relations", "groups", "callouts", "presentation"] {
        if let Some(items) = doc.get(kind) {
            for item in list(items, if kind == "presentation" { 1000 } else { 5000 })? {
                object(item)?;
                super::presentation_validation::annotation(kind, item)?;
                if kind != "presentation" && !annotation_ids.insert(id(&item["id"])?) {
                    return Err(invalid("批注标识重复"));
                }
                match kind {
                    "relations" => {
                        require(&item["from"])?;
                        require(&item["to"])?;
                    }
                    "groups" => {
                        let ids = list(&item["topicIds"], 20_000)?;
                        if ids.is_empty()
                            || !["boundary", "summary"].iter().any(|k| item["kind"] == *k)
                        {
                            return Err(invalid("主题分组无效"));
                        }
                        let mut unique = HashSet::new();
                        for topic in ids {
                            require(topic)?;
                            if !unique.insert(id(topic)?) {
                                return Err(invalid("主题分组包含重复成员"));
                            }
                        }
                    }
                    _ => require(&item["topicId"])?,
                }
            }
        }
    }
    if let Some(floating) = doc.get("floatingIds") {
        let root_children = list(&topics[text(&doc["rootId"])?]["children"], 20_000)?;
        let mut ids = HashSet::new();
        for item in list(floating, 20_000)? {
            require(item)?;
            if !root_children.contains(item) || !ids.insert(id(item)?) {
                return Err(invalid("游离主题无效"));
            }
        }
        if let Some(positions) = doc.get("floatingPositions") {
            for (key, point) in object(positions)? {
                keys(point, &["x", "y"])?;
                if !ids.contains(key.as_str())
                    || ["x", "y"].iter().any(|field| {
                        point[*field]
                            .as_f64()
                            .is_none_or(|n| !(-1_000_000.0..=1_000_000.0).contains(&n))
                    })
                {
                    return Err(invalid("游离主题位置无效"));
                }
            }
        }
    }
    if doc.get("floatingIds").is_none()
        && doc
            .get("floatingPositions")
            .is_some_and(|v| v.as_object().is_none_or(|positions| !positions.is_empty()))
    {
        return Err(invalid("位置仅可属于游离主题"));
    }
    let mut indegree: HashMap<&str, usize> = topics.keys().map(|key| (key.as_str(), 0)).collect();
    let mut dependencies = HashMap::new();
    for (key, topic) in topics {
        if let Some(items) = topic["metadata"]["task"].get("dependencies") {
            let mut ids = HashSet::new();
            for dependency in list(items, 128)? {
                require(dependency)?;
                let dependency = id(dependency)?;
                if dependency == key || !ids.insert(dependency) {
                    return Err(invalid("任务依赖无效"));
                }
                *indegree.get_mut(dependency).unwrap() += 1;
            }
            dependencies.insert(key.as_str(), ids);
        }
    }
    let mut ready: Vec<_> = indegree
        .iter()
        .filter(|(_, n)| **n == 0)
        .map(|(key, _)| *key)
        .collect();
    let mut visited = 0;
    while let Some(key) = ready.pop() {
        visited += 1;
        if let Some(ids) = dependencies.get(key) {
            for dependency in ids {
                let remaining = indegree.get_mut(dependency).unwrap();
                *remaining -= 1;
                if *remaining == 0 {
                    ready.push(dependency);
                }
            }
        }
    }
    if visited != topics.len() {
        return Err(invalid("任务依赖包含循环"));
    }
    super::asset_validation::assets(doc)?;
    Ok(())
}
