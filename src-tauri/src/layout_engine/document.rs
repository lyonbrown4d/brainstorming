use super::model::{Document, Point, Summary, Topic};
use serde_json::Value;
use std::collections::HashMap;

pub fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
  value.get(key)?.as_str()
}

pub fn number(value: &Value, key: &str) -> f64 {
  value.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}

impl Document {
  pub fn parse(value: &Value) -> Result<Self, String> {
    let root_id = text(value, "rootId").ok_or("缺少中心主题")?.to_owned();
    let entries = value
      .get("topics")
      .and_then(Value::as_object)
      .ok_or("缺少主题")?;
    let mut topics = HashMap::with_capacity(entries.len());
    for (key, item) in entries {
      let id = text(item, "id").unwrap_or(key).to_owned();
      let children = item
        .get("children")
        .and_then(Value::as_array)
        .ok_or("布局子主题不存在")?
        .iter()
        .map(|child| child.as_str().map(str::to_owned).ok_or("无效子主题 ID"))
        .collect::<Result<Vec<_>, _>>()?;
      let style = item.get("style").unwrap_or(&Value::Null);
      topics.insert(
        key.clone(),
        Topic {
          id,
          children,
          collapsed: item
            .get("collapsed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
          side: text(item, "side").unwrap_or("right").to_owned(),
          structure: text(item, "structure").map(str::to_owned),
          offset_x: number(style, "offsetX"),
          offset_y: number(style, "offsetY"),
        },
      );
    }
    if !topics.contains_key(&root_id) {
      return Err("缺少中心主题".into());
    }
    let floating_ids = value
      .get("floatingIds")
      .and_then(Value::as_array)
      .map(|items| {
        items
          .iter()
          .filter_map(Value::as_str)
          .map(str::to_owned)
          .collect()
      })
      .unwrap_or_default();
    let floating_positions = value
      .get("floatingPositions")
      .and_then(Value::as_object)
      .map(|items| {
        items
          .iter()
          .map(|(id, point)| {
            (
              id.clone(),
              Point {
                x: number(point, "x"),
                y: number(point, "y"),
              },
            )
          })
          .collect()
      })
      .unwrap_or_default();
    let groups = value
      .get("groups")
      .and_then(Value::as_array)
      .map(|items| {
        items
          .iter()
          .filter_map(|group| {
            if text(group, "kind") != Some("summary") {
              return None;
            }
            let summary_id = text(group, "summaryTopicId")?.to_owned();
            let topic_ids: Vec<_> = group
              .get("topicIds")?
              .as_array()?
              .iter()
              .filter_map(Value::as_str)
              .map(str::to_owned)
              .collect();
            if !topic_ids.iter().any(|id| topics.contains_key(id)) {
              return None;
            }
            Some(Summary {
              topic_ids,
              summary_id,
            })
          })
          .collect()
      })
      .unwrap_or_default();
    Ok(Self {
      root_id,
      topics,
      layout: value
        .get("settings")
        .and_then(|settings| text(settings, "layout"))
        .unwrap_or("map")
        .to_owned(),
      floating_ids,
      floating_positions,
      groups,
    })
  }
}
