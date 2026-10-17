import { translate } from '@renderer/i18n'
import type { Command } from '@core'
import type { EditorData } from '@renderer/state/editorTypes'

/** The same candidate command is used by commit and recovery, including formatting-only edits. */
export const draftCommand = (state: EditorData): Command | null => {
  const { editingId, editingSurface, draft, richDraft } = state
  if (!editingId) return null
  const topic = state.history.document.topics[editingId]
  if (!topic) return null
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
