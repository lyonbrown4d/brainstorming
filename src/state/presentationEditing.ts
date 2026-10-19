import type { PresentationStep } from '@core'
import { presentationPlan } from '@core/presentation-plan'
import { useEditor } from '@renderer/state/editor'
import type { EditorData } from '@renderer/state/editorTypes'
import { usePresentation } from '@renderer/state/presentation'

export interface PresentationNoteTarget {
  workbookId: string
  sheetId: string
  documentId: string
  pageIndex: number
  topicId: string
}

const belongsToDocument = (state: EditorData, target: PresentationNoteTarget): boolean =>
  state.workbook.id === target.workbookId &&
  state.activeSheetId === target.sheetId &&
  state.history.document.id === target.documentId &&
  presentationPlan(state.history.document)[target.pageIndex]?.topicId === target.topicId

export const isPresentationNoteDraft = (
  state: EditorData,
  target: PresentationNoteTarget,
): boolean =>
  belongsToDocument(state, target) &&
  state.editingSurface === 'presentation-notes' &&
  state.editingId === target.topicId &&
  state.editingPageIndex === target.pageIndex

/** Re-entering after Save starts a fresh edit without changing the canvas selection. */
export const startPresentationNotes = (target: PresentationNoteTarget): boolean => {
  let state = useEditor.getState()
  if (state.busy || usePresentation.getState().playing || !belongsToDocument(state, target))
    return false
  if (isPresentationNoteDraft(state, target)) return true
  state.commitDraft()
  state = useEditor.getState()
  if (state.editingId || !belongsToDocument(state, target)) return false
  const step = presentationPlan(state.history.document)[target.pageIndex]
  useEditor.setState({
    editingId: target.topicId,
    editingSurface: 'presentation-notes',
    editingPageIndex: target.pageIndex,
    draft: step?.notes ?? state.history.document.topics[target.topicId]?.notes ?? '',
    richDraft: null,
  })
  return true
}

/** Build edits after committing notes so stale render props cannot overwrite them. */
export const editPresentationPages = (
  update: (steps: readonly PresentationStep[]) => readonly PresentationStep[],
): boolean => {
  const state = useEditor.getState()
  if (state.busy || usePresentation.getState().playing) return false
  state.commitDraft()
  const current = useEditor.getState()
  if (current.editingId) return false
  return current.command({
    type: 'setPresentation',
    steps: update(presentationPlan(current.history.document)),
  })
}
