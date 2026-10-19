//! Versioned, compile-time template resources exposed through a fixed ID catalog.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::OnceLock;

type Result<T> = std::result::Result<T, String>;
type Localized = [String; 2];
const INVALID: &str = "模板目录不可用";
const UNKNOWN: &str = "模板不存在";
const RESOURCES: &[(&str, &str)] = &[
  ("brainstorm", include_str!("../templates/brainstorm.json")),
  ("scamper", include_str!("../templates/scamper.json")),
  ("six-hats", include_str!("../templates/six-hats.json")),
  ("project", include_str!("../templates/project.json")),
  ("meeting", include_str!("../templates/meeting.json")),
  (
    "retrospective",
    include_str!("../templates/retrospective.json"),
  ),
  ("decision", include_str!("../templates/decision.json")),
  ("swot", include_str!("../templates/swot.json")),
  ("root-cause", include_str!("../templates/root-cause.json")),
  (
    "user-research",
    include_str!("../templates/user-research.json"),
  ),
  ("study", include_str!("../templates/study.json")),
  ("reading", include_str!("../templates/reading.json")),
  ("writing", include_str!("../templates/writing.json")),
  (
    "personal-goals",
    include_str!("../templates/personal-goals.json"),
  ),
];

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Group {
  Ideate,
  Plan,
  Analyze,
  Learn,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Icon {
  Lightbulb,
  WandSparkles,
  BrainCircuit,
  ClipboardList,
  MessagesSquare,
  RotateCcw,
  GitBranch,
  ChartNoAxesCombined,
  Search,
  Users,
  GraduationCap,
  BookOpen,
  PenLine,
  Target,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LayoutKind {
  Map,
  LogicRight,
  LogicLeft,
  OrgDown,
  OrgUp,
  TreeDown,
  TreeUp,
  BraceRight,
  BraceLeft,
  Fishbone,
  Timeline,
  TimelineVertical,
  TreeTableRight,
  TreeTableDown,
  Matrix,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Summary {
  pub id: String,
  pub title: Localized,
  pub description: Localized,
  pub group: Group,
  pub icon: Icon,
  pub layout: LayoutKind,
  pub count: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
  pub version: u8,
  pub templates: Vec<Summary>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Topic {
  pub title: Localized,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub notes: Option<Localized>,
  #[serde(default)]
  pub children: Vec<Topic>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Template {
  pub version: u8,
  pub id: String,
  pub title: Localized,
  pub description: Localized,
  pub group: Group,
  pub icon: Icon,
  pub layout: LayoutKind,
  pub topics: Vec<Topic>,
}

struct Catalog {
  manifest: Manifest,
  templates: Vec<Template>,
}

static CATALOG: OnceLock<Result<Catalog>> = OnceLock::new();

pub fn list() -> Result<Manifest> {
  Ok(catalog()?.manifest.clone())
}

pub fn get(id: &str) -> Result<Template> {
  // Resolve only known IDs; no request data is ever interpreted as a path.
  if !RESOURCES.iter().any(|(known, _)| *known == id) {
    return Err(UNKNOWN.into());
  }
  catalog()?
    .templates
    .iter()
    .find(|template| template.id == id)
    .cloned()
    .ok_or_else(|| UNKNOWN.into())
}

fn catalog() -> Result<&'static Catalog> {
  CATALOG.get_or_init(load).as_ref().map_err(Clone::clone)
}

fn load() -> Result<Catalog> {
  let mut manifest: Manifest = serde_json::from_str(include_str!("../templates/manifest.json"))
    .map_err(|_| INVALID.to_string())?;
  if manifest.version != 1 || manifest.templates.len() != RESOURCES.len() {
    return Err(INVALID.into());
  }
  let mut ids = HashSet::new();
  let mut templates = Vec::with_capacity(RESOURCES.len());
  for summary in &mut manifest.templates {
    if !ids.insert(summary.id.clone()) {
      return Err(INVALID.into());
    }
    let (_, resource) = RESOURCES
      .iter()
      .find(|(id, _)| *id == summary.id)
      .ok_or(INVALID)?;
    let template: Template = serde_json::from_str(resource).map_err(|_| INVALID.to_string())?;
    let count = validate(&template)?;
    let derived = Summary {
      id: template.id.clone(),
      title: template.title.clone(),
      description: template.description.clone(),
      group: template.group.clone(),
      icon: template.icon.clone(),
      layout: template.layout.clone(),
      count,
    };
    if *summary != derived {
      return Err(INVALID.into());
    }
    *summary = derived;
    templates.push(template);
  }
  Ok(Catalog {
    manifest,
    templates,
  })
}

fn text(value: &Localized, limit: usize) -> Result<()> {
  if value
    .iter()
    .any(|text| text.trim().is_empty() || text.chars().count() > limit)
  {
    return Err(INVALID.into());
  }
  Ok(())
}

fn validate(template: &Template) -> Result<usize> {
  if template.version != 1 || !RESOURCES.iter().any(|(id, _)| *id == template.id) {
    return Err(INVALID.into());
  }
  text(&template.title, 500)?;
  text(&template.description, 500)?;
  let mut count = 1; // The template title becomes the document root.
  let mut pending = vec![(&template.topics, 1)];
  while let Some((topics, depth)) = pending.pop() {
    if depth > 10 || topics.len() > 100 {
      return Err(INVALID.into());
    }
    for topic in topics {
      count += 1;
      if count > 1_000 {
        return Err(INVALID.into());
      }
      text(&topic.title, 500)?;
      if let Some(notes) = &topic.notes {
        text(notes, 10_000)?;
      }
      if !topic.children.is_empty() {
        pending.push((&topic.children, depth + 1));
      }
    }
  }
  Ok(count)
}

#[cfg(test)]
#[path = "templates_tests.rs"]
mod tests;
