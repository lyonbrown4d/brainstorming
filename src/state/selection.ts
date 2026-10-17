import { create } from 'zustand'
import { getParentId, normalizeTopicSelection, type TopicStyle } from '@core'
import type { EditorData } from '@renderer/state/editorTypes'
import { useEditor } from '@renderer/state/editor'

const empty: readonly string[] = []
export const useSelection = create<{
  sheets: Readonly<Record<string, readonly string[]>>
}>(() => ({ sheets: {} }))

export const selectedTopicIds = (state: EditorData): readonly string[] => {
  const ids = useSelection.getState().sheets[state.activeSheetId] ?? [state.selectedId]
  const valid = ids.filter((id) => state.history.document.topics[id])
  return valid.length ? valid : [state.selectedId]
}

export const setSelectedTopics = (ids: readonly string[]): void => {
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  const valid = [...new Set(ids)].filter((id) => current.history.document.topics[id])
  if (!valid.length) valid.push(current.selectedId)
  useSelection.setState((selection) => ({
    sheets: { ...selection.sheets, [current.activeSheetId]: valid },
  }))
  useEditor.setState({ selectedId: valid.at(-1) ?? current.selectedId })
}

export const selectTopic = (id: string, additive = false): void => {
  const state = useEditor.getState()
  const current = selectedTopicIds(state)
  if (!additive && current.length === 1 && current[0] === id) return
  setSelectedTopics(
    additive
      ? current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
      : [id],
  )
}

export const useTopicSelected = (id: string): boolean => {
  const sheetId = useEditor((state) => state.activeSheetId)
  const primary = useEditor((state) => state.selectedId === id)
  return useSelection((state) => {
    const ids = state.sheets[sheetId]
    return ids?.length ? ids.includes(id) : primary
  })
}

export const useSelectedIds = (): readonly string[] => {
  const sheetId = useEditor((state) => state.activeSheetId)
  return useSelection((state) => state.sheets[sheetId] ?? empty)
}

export const deleteSelectedTopics = (): void => {
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  const ids = normalizeTopicSelection(
    current.history.document,
    selectedTopicIds(current).filter((id) => id !== current.history.document.rootId),
  )
  if (!ids.length) return
  const parentId = getParentId(current.history.document, ids[0] ?? '')
  if (current.command({ type: 'deleteTopics', topicIds: ids }))
    setSelectedTopics([parentId ?? current.history.document.rootId])
}

export const updateSelectedStyle = (patch: TopicStyle, topicId?: string): void => {
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  const selected = selectedTopicIds(current)
  const ids = topicId && !selected.includes(topicId) ? [topicId] : selected
  current.command({
    type: 'batch',
    commands: ids.flatMap((id) => {
      const topic = current.history.document.topics[id]
      return topic
        ? [{ type: 'setTopicStyle' as const, topicId: id, style: { ...topic.style, ...patch } }]
        : []
    }),
  })
}

export const moveSelectedTopics = (parentId: string): void => {
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  current.command({ type: 'moveTopics', topicIds: selectedTopicIds(current), parentId })
}
