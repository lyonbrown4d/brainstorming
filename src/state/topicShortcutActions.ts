import { getSubtreeIds } from '@core/tree'
import { create } from 'zustand'
import { getParentId, getVisibleTopicIds, normalizeTopicSelection } from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, setCanvasSelection } from '@renderer/state/selection'
import { selectInspectorMode } from '@renderer/state/inspectorNavigation'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'

export const toggleSelectedBranches = (recursive = false): void => {
  const state = useEditor.getState()
  const document = state.history.document
  const roots = normalizeTopicSelection(document, selectedTopicIds(state))
  const ids = [
    ...new Set(recursive ? roots.flatMap((id) => getSubtreeIds(document, id)) : roots),
  ].filter((id) => document.topics[id]?.children.length)
  const collapse = ids.some((id) => !document.topics[id]?.collapsed)
  const commands = ids
    .filter((id) => document.topics[id]?.collapsed !== collapse)
    .map((topicId) => ({ type: 'toggleCollapse' as const, topicId }))
  if (commands.length) state.command({ type: 'batch', commands })
}

export const selectRelatedTopics = (kind: 'siblings' | 'children'): void => {
  const state = useEditor.getState()
  const document = state.history.document
  const parent = kind === 'children' ? state.selectedId : getParentId(document, state.selectedId)
  if (!parent) return
  const visible = new Set(getVisibleTopicIds(document))
  const ids = (document.topics[parent]?.children ?? []).filter((id) => visible.has(id))
  if (ids.length) setCanvasSelection(ids, [])
}

interface PropertyFocus {
  readonly documentId: string
  readonly sheetId: string
  readonly topicId: string
  readonly section: 'notes' | 'link'
  readonly sequence: number
}
export const useTopicPropertyFocus = create<{ request: PropertyFocus | null; sequence: number }>(
  () => ({
    request: null,
    sequence: 0,
  }),
)

export const focusTopicProperty = (section: PropertyFocus['section']): void => {
  useEditor.getState().commitDraft()
  const state = useEditor.getState()
  if (state.editingId || state.busy || !selectedTopicIds(state).length) return
  setCanvasSelection([state.selectedId], [])
  useAnnotationInteraction.setState({
    selected: null,
    editing: false,
    fromId: null,
    relationMode: false,
  })
  selectInspectorMode('topic')
  useTopicPropertyFocus.setState((previous) => ({
    sequence: previous.sequence + 1,
    request: {
      documentId: state.history.document.id,
      sheetId: state.activeSheetId,
      topicId: state.selectedId,
      section,
      sequence: previous.sequence + 1,
    },
  }))
}
