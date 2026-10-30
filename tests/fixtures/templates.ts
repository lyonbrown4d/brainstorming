import manifest from '@project/crates/brainstorming-engine/templates/manifest.json'
import brainstorm from '@project/crates/brainstorming-engine/templates/brainstorm.json'
import scamper from '@project/crates/brainstorming-engine/templates/scamper.json'
import sixHats from '@project/crates/brainstorming-engine/templates/six-hats.json'
import project from '@project/crates/brainstorming-engine/templates/project.json'
import meeting from '@project/crates/brainstorming-engine/templates/meeting.json'
import retrospective from '@project/crates/brainstorming-engine/templates/retrospective.json'
import decision from '@project/crates/brainstorming-engine/templates/decision.json'
import swot from '@project/crates/brainstorming-engine/templates/swot.json'
import rootCause from '@project/crates/brainstorming-engine/templates/root-cause.json'
import userResearch from '@project/crates/brainstorming-engine/templates/user-research.json'
import study from '@project/crates/brainstorming-engine/templates/study.json'
import reading from '@project/crates/brainstorming-engine/templates/reading.json'
import writing from '@project/crates/brainstorming-engine/templates/writing.json'
import personalGoals from '@project/crates/brainstorming-engine/templates/personal-goals.json'
import {
  contentTemplateSchema,
  templateCatalogSchema,
  templateIdSchema,
  type TemplatesAPI,
  type TemplateId,
} from '@shared/templates'

const files: Record<TemplateId, unknown> = {
  brainstorm,
  scamper,
  'six-hats': sixHats,
  project,
  meeting,
  retrospective,
  decision,
  swot,
  'root-cause': rootCause,
  'user-research': userResearch,
  study,
  reading,
  writing,
  'personal-goals': personalGoals,
}
export const fixtureTemplate = (id: TemplateId) => {
  const validId = templateIdSchema.parse(id)
  if (!Object.hasOwn(files, validId)) throw new Error('Unknown fixture template')
  return contentTemplateSchema.parse(files[validId])
}
export const fixtureCatalog = templateCatalogSchema.parse(manifest)
export const templateAPI: TemplatesAPI = {
  listTemplates: () => Promise.resolve(templateCatalogSchema.parse(manifest)),
  getTemplate: (id) => Promise.resolve(fixtureTemplate(id)),
}
