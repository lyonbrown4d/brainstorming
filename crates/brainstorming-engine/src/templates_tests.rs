use super::*;

fn count_topics(topics: &[Topic]) -> usize {
  topics
    .iter()
    .map(|topic| 1 + count_topics(&topic.children))
    .sum()
}

#[test]
fn catalog_serves_all_fourteen_validated_templates_with_derived_counts() {
  let manifest = list().unwrap();
  assert_eq!(manifest.version, 1);
  assert_eq!(manifest.templates.len(), 14);
  for summary in manifest.templates {
    let template = get(&summary.id).unwrap();
    assert_eq!(template.version, 1);
    assert_eq!(template.title, summary.title);
    assert_eq!(template.description, summary.description);
    assert_eq!(template.group, summary.group);
    assert_eq!(template.icon, summary.icon);
    assert_eq!(template.layout, summary.layout);
    assert_eq!(summary.count, 1 + count_topics(&template.topics));
    assert!(summary.count > template.topics.len() + 1);
  }
}

#[test]
fn unknown_and_path_shaped_ids_are_rejected() {
  for id in [
    "",
    "unknown",
    "../brainstorm",
    "brainstorm.json",
    "/etc/passwd",
    "..\\brainstorm",
    "BRAINSTORM",
  ] {
    assert_eq!(get(id).unwrap_err(), UNKNOWN);
  }
}

#[test]
fn invalid_versions_text_depth_and_node_totals_are_rejected() {
  let original = get("brainstorm").unwrap();
  let mut template = original.clone();
  template.version = 2;
  assert!(validate(&template).is_err());
  template = original.clone();
  template.title[0] = " ".into();
  assert!(validate(&template).is_err());
  template = original.clone();
  template.topics[0].title[1] = "a".repeat(501);
  assert!(validate(&template).is_err());
  template = original.clone();
  let leaf = Topic {
    title: ["节点".into(), "Topic".into()],
    notes: None,
    children: vec![],
  };
  let mut branch = leaf.clone();
  for _ in 0..10 {
    branch = Topic {
      children: vec![branch],
      ..leaf.clone()
    };
  }
  template.topics = vec![branch];
  assert!(validate(&template).is_err());
  template.topics = vec![
    Topic {
      children: vec![leaf; 100],
      ..template.topics[0].clone()
    };
    10
  ];
  assert!(validate(&template).is_err());
}
