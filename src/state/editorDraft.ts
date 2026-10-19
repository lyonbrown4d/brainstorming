import { translate } from '@renderer/i18n'
import type { Command } from '@core'
import type { EditorData } from '@renderer/state/editorTypes'
import { presentationPlan } from '@core/presentation-plan'

export const emptyEditorDraft = {
  editingId: null,
  editingSurface: null,
  editingPageIndex: null,
  draft: '',
  richDraft: null,
} as const

/** Commit and save snapshots share the same candidate, including formatting-only edits. */
export const draftCommand = (state: EditorData): Command | null => {
  const { editingId, editingSurface, draft, richDraft } = state
  if (!editingId) return null
  const topic = state.history.document.topics[editingId]
  if (!topic) return null
  if (editingSurface === 'presentation-notes') {
    const steps = presentationPlan(state.history.document)
    const index = state.editingPageIndex
    const step = index === null ? undefined : steps[index]
    if (step?.topicId !== editingId || draft === (step.notes ?? topic.notes ?? '')) return null
    return {
      type: 'setPresentation',
      steps: steps.map((entry, row) => (row === index ? { ...entry, notes: draft } : entry)),
    }
  }
  if (editingSurface === 'notes')
    return draft === (topic.notes ?? '')
      ? null
      : { type: 'setTopicNotes', topicId: editingId, notes: draft }
  const title = draft.trim() || translate('untitledTopic')
  if (editingSurface === 'rich-title') {
    const richTitle = richDraft ?? topic.metadata?.richTitle ?? topic.title
    if (title === topic.title && richTitle === topic.metadata?.richTitle) return null
    return {
      type: 'batch',
      commands: [
        { type: 'renameTopic', topicId: editingId, title },
        {
          type: 'setTopicMetadata',
          topicId: editingId,
          metadata: { ...topic.metadata, richTitle },
        },
      ],
    }
  }
  return title === topic.title ? null : { type: 'renameTopic', topicId: editingId, title }
}
