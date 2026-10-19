import manifest from '@project/src-tauri/templates/manifest.json'
import brainstorm from '@project/src-tauri/templates/brainstorm.json'
import scamper from '@project/src-tauri/templates/scamper.json'
import sixHats from '@project/src-tauri/templates/six-hats.json'
import project from '@project/src-tauri/templates/project.json'
import meeting from '@project/src-tauri/templates/meeting.json'
import retrospective from '@project/src-tauri/templates/retrospective.json'
import decision from '@project/src-tauri/templates/decision.json'
import swot from '@project/src-tauri/templates/swot.json'
import rootCause from '@project/src-tauri/templates/root-cause.json'
import userResearch from '@project/src-tauri/templates/user-research.json'
import study from '@project/src-tauri/templates/study.json'
import reading from '@project/src-tauri/templates/reading.json'
import writing from '@project/src-tauri/templates/writing.json'
import personalGoals from '@project/src-tauri/templates/personal-goals.json'
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
