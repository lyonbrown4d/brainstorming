import { create } from 'zustand'
import { getParentId, normalizeTopicSelection, type TopicStyle } from '@core'
import type { EditorData } from '@renderer/state/editorTypes'
import { useEditor } from '@renderer/state/editor'

const empty: readonly string[] = []
export const useSelection = create<{
  sheets: Readonly<Record<string, readonly string[]>>
  drawings: Readonly<Record<string, readonly string[]>>
}>(() => ({ sheets: {}, drawings: {} }))

export const selectedTopicIds = (state: EditorData): readonly string[] => {
  const ids = useSelection.getState().sheets[state.activeSheetId] ?? [state.selectedId]
  const valid = ids.filter((id) => state.history.document.topics[id])
  return valid
}

export const selectedDrawingIds = (state: EditorData): readonly string[] => {
  const valid = new Set(state.history.document.drawings?.map((stroke) => stroke.id))
  return (useSelection.getState().drawings[state.activeSheetId] ?? empty).filter((id) =>
    valid.has(id),
  )
}

export const setCanvasSelection = (
  topicIds: readonly string[],
  drawingIds: readonly string[],
): void => {
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  const topics = [...new Set(topicIds)].filter((id) => current.history.document.topics[id])
  const available = new Set(current.history.document.drawings?.map((stroke) => stroke.id))
  const drawings = [...new Set(drawingIds)].filter((id) => available.has(id))
  useSelection.setState((selection) => ({
    sheets: { ...selection.sheets, [current.activeSheetId]: topics },
    drawings: { ...selection.drawings, [current.activeSheetId]: drawings },
  }))
  if (topics.length) useEditor.setState({ selectedId: topics.at(-1) ?? current.selectedId })
}

export const setSelectedTopics = (ids: readonly string[]): void => {
  setCanvasSelection(ids.length ? ids : [useEditor.getState().selectedId], [])
}

export const selectDrawing = (id: string, additive: boolean): void => {
  const state = useEditor.getState()
  const current = selectedDrawingIds(state)
  setCanvasSelection(
    additive ? selectedTopicIds(state) : [],
    additive
      ? current.includes(id)
        ? current.filter((key) => key !== id)
        : [...current, id]
      : [id],
  )
}

export const useSelectedDrawingIds = (): readonly string[] => {
  const sheetId = useEditor((state) => state.activeSheetId)
  return useSelection((state) => state.drawings[sheetId] ?? empty)
}

export const selectTopic = (id: string, additive = false): void => {
  const state = useEditor.getState()
  const current = selectedTopicIds(state)
  if (!additive && current.length === 1 && current[0] === id && !selectedDrawingIds(state).length)
    return
  setCanvasSelection(
    additive
      ? current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
      : [id],
    additive ? selectedDrawingIds(state) : [],
  )
}

export const useTopicSelected = (id: string): boolean => {
  const sheetId = useEditor((state) => state.activeSheetId)
  const primary = useEditor((state) => state.selectedId === id)
  return useSelection((state) => {
    const ids = state.sheets[sheetId]
    return ids ? ids.includes(id) : primary
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
  const drawings = selectedDrawingIds(current)
  if (!ids.length && !drawings.length) return
  const parentId = getParentId(current.history.document, ids[0] ?? '')
  if (
    current.command({
      type: 'batch',
      commands: [
        ...(ids.length ? [{ type: 'deleteTopics' as const, topicIds: ids }] : []),
        ...drawings.map((drawingId) => ({ type: 'removeDrawing' as const, drawingId })),
      ],
    })
  )
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
