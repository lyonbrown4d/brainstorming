import { getParentId, type MindMapDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import { flushNativeEditor } from '@renderer/state/nativeEditorQueue'
import { indentOutlineTopic } from '@renderer/state/structuralEditing'
import { addTopic } from '@renderer/state/topicCreation'
import {
  outlineSessionKey,
  updateOutlineSession,
  useOutlineWorkspaceState,
} from '@renderer/components/documents/OutlineWorkspaceState'

/** Drain pending title commands before calculating structure from the Rust mirror. */
export const runOutlineAction = (action: () => void | Promise<void>): void => {
  const source = useEditor.getState()
  if (source.busy) return
  source.commitDraft()
  if (useEditor.getState().editingId) return
  void flushNativeEditor(source.workbook.id)
    .then(async () => {
      const current = useEditor.getState()
      if (
        current.workbook.id === source.workbook.id &&
        current.activeSheetId === source.activeSheetId &&
        !current.editingId &&
        !current.busy
      )
        await action()
    })
    .catch((error: unknown) => {
      if (useEditor.getState().workbook.id === source.workbook.id)
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
    })
}

export const setOutlineWorkspaceOpen = (open: boolean): void => {
  runOutlineAction(() => {
    const state = useEditor.getState()
    updateOutlineSession(outlineSessionKey(state.workbook.id, state.activeSheetId), { open })
    if (!open)
      requestAnimationFrame(() => {
        window.document.getElementById('sheet-panel')?.focus({ preventScroll: true })
      })
  })
}

export const addOutlineTopic = (kind: 'child' | 'sibling'): void => {
  runOutlineAction(() => {
    addTopic(kind, false, 'outline')
  })
}

export const indentOutlineSelection = (direction: 1 | -1, edit = false): void => {
  runOutlineAction(async () => {
    const source = useEditor.getState()
    const id = source.selectedId
    indentOutlineTopic(direction)
    await flushNativeEditor(source.workbook.id)
    const current = useEditor.getState()
    if (
      edit &&
      current.workbook.id === source.workbook.id &&
      current.activeSheetId === source.activeSheetId &&
      useOutlineWorkspaceState.getState().sessions[
        outlineSessionKey(source.workbook.id, source.activeSheetId)
      ]?.open &&
      current.selectedId === id &&
      !current.editingId
    )
      current.startEdit(id, undefined, 'outline', 'end')
  })
}

export type OutlineDropPosition = 'before' | 'inside' | 'after'

export const outlineDropCommand = (
  document: MindMapDocument,
  id: string,
  targetId: string,
  position: OutlineDropPosition,
) => {
  if (id === document.rootId || id === targetId) return undefined
  const target = document.topics[targetId]
  if (!target || !document.topics[id]) return undefined
  const parentId = position === 'inside' ? targetId : getParentId(document, targetId)
  if (!parentId) return undefined
  for (let ancestor: string | undefined = parentId; ancestor;) {
    if (ancestor === id) return undefined
    ancestor = getParentId(document, ancestor)
  }
  const siblings = document.topics[parentId]?.children.filter((child) => child !== id) ?? []
  const index =
    position === 'inside'
      ? siblings.length
      : siblings.indexOf(targetId) + (position === 'after' ? 1 : 0)
  if (index < 0) return undefined
  return { type: 'moveTopics' as const, topicIds: [id], parentId, index }
}
