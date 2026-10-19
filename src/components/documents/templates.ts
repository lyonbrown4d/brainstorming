import { applyCommand, createDocument, type Command, type MindMapDocument } from '@core'
import { i18n } from '@renderer/i18n'
import { fetchTemplate } from '@renderer/hooks/useTemplates'
import {
  templateText,
  type ContentTemplate,
  type TemplateId,
  type TemplateTopic,
} from '@shared/templates'

export type { TemplateId } from '@shared/templates'

/** Build a fresh editable tree from validated backend content. */
export const instantiateTemplate = (
  template: ContentTemplate,
  language: string,
): MindMapDocument => {
  const commands: Command[] = [
    { type: 'setDocumentSettings', settings: { layout: template.layout } },
  ]
  const append = (node: TemplateTopic, parentId: string, index: number, rootBranch: boolean) => {
    const topicId = crypto.randomUUID()
    commands.push({
      type: 'addTopic',
      parentId,
      id: topicId,
      title: templateText(node.title, language),
      ...(rootBranch ? { side: index % 2 ? ('right' as const) : ('left' as const) } : {}),
    })
    if (node.notes)
      commands.push({
        type: 'setTopicNotes',
        topicId,
        notes: templateText(node.notes, language),
      })
    node.children.forEach((child, childIndex) => {
      append(child, topicId, childIndex, false)
    })
  }
  const document = createDocument(templateText(template.title, language), crypto.randomUUID())
  template.topics.forEach((node, index) => {
    append(node, document.rootId, index, true)
  })
  return applyCommand(document, { type: 'batch', commands })
}

export const createTemplate = async (
  id: TemplateId,
  language = i18n.resolvedLanguage ?? i18n.language,
): Promise<MindMapDocument> => instantiateTemplate(await fetchTemplate(id), language)
