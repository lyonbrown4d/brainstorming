import { translate } from '@renderer/i18n'
import { getParentId } from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds } from '@renderer/state/selection'

const structuralSelection = () => {
  useEditor.getState().commitDraft()
  const state = useEditor.getState()
  if (state.editingId || !selectedTopicIds(state).includes(state.selectedId)) return undefined
  const document = state.history.document
  const topic = document.topics[state.selectedId]
  const parentId = getParentId(document, state.selectedId)
  const parent = parentId ? document.topics[parentId] : undefined
  if (!topic || !parent || document.floatingIds?.includes(topic.id)) return undefined
  return { state, document, topic, parent }
}

export const insertParentTopic = (): void => {
  const selection = structuralSelection()
  if (!selection) return
  const { state, topic } = selection
  const id = crypto.randomUUID()
  if (
    state.command({
      type: 'insertParentTopic',
      topicId: topic.id,
      id,
      title: translate('newTopic'),
    })
  )
    useEditor.getState().startEdit(id)
}

export const removeTopicOnly = (): void => {
  const selection = structuralSelection()
  if (!selection) return
  const { state, topic, parent } = selection
  if (state.command({ type: 'removeTopicOnly', topicId: topic.id }))
    useEditor.getState().select(topic.children[0] ?? parent.id)
}

export const reorderSelectedTopic = (direction: -1 | 1): void => {
  const selection = structuralSelection()
  if (!selection) return
  const { state, document, topic, parent } = selection
  const mapRoot =
    parent.id === document.rootId &&
    (parent.structure ?? document.settings?.layout ?? 'map') === 'map'
  const siblings = parent.children.filter(
    (id) =>
      !document.floatingIds?.includes(id) && (!mapRoot || document.topics[id]?.side === topic.side),
  )
  const neighbor = siblings[siblings.indexOf(topic.id) + direction]
  if (!neighbor) return
  state.command({
    type: 'moveTopics',
    topicIds: [topic.id],
    parentId: parent.id,
    index: parent.children.indexOf(neighbor),
  })
}

/** Outliner Tab changes hierarchy; canvas Tab creates a new child topic. */
export const indentOutlineTopic = (direction: 1 | -1): void => {
  const selection = structuralSelection()
  if (!selection) return
  const { state, document, topic, parent } = selection
  const index = parent.children.indexOf(topic.id)
  if (direction === 1) {
    const previous = parent.children[index - 1]
    if (previous && !document.floatingIds?.includes(previous))
      state.command({ type: 'moveTopics', topicIds: [topic.id], parentId: previous })
    return
  }
  const grandparentId = getParentId(document, parent.id)
  const grandparent = grandparentId ? document.topics[grandparentId] : undefined
  if (grandparent)
    state.command({
      type: 'moveTopics',
      topicIds: [topic.id],
      parentId: grandparent.id,
      index: grandparent.children.indexOf(parent.id) + 1,
    })
}
