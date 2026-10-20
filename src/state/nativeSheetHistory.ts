import type { EditorOperation, NativeEditorSnapshot } from '@shared/compute'
import { snapshotSheetId } from '@renderer/state/nativeEditorState'

interface SheetFocus {
  readonly before: string
  readonly after: string
}
interface FocusHistory {
  revision: string
  readonly past: (SheetFocus | null)[]
  readonly future: (SheetFocus | null)[]
}
const histories = new Map<string, FocusHistory>()

export const clearNativeSheetHistory = (workbookId: string): void => {
  histories.delete(workbookId)
}

/** Native history owns content; these small markers restore only structural Sheet focus. */
export const nativeSnapshotSheet = (
  snapshot: NativeEditorSnapshot,
  previousRevision: string,
  operation: EditorOperation,
  currentSheetId: string,
  requestedSheetId?: string,
): string => {
  const id = snapshot.workbook.id
  let history = histories.get(id)
  if (history?.revision !== previousRevision) {
    history = { revision: previousRevision, past: [], future: [] }
    histories.set(id, history)
  }
  let after = snapshotSheetId(snapshot.workbook, currentSheetId, requestedSheetId)
  if (snapshot.revision !== previousRevision) {
    if (operation.kind === 'undo') {
      const focus = history.past.pop()
      history.future.push(focus ?? null)
      if (focus) after = snapshotSheetId(snapshot.workbook, after, focus.before)
    } else if (operation.kind === 'redo') {
      const focus = history.future.pop()
      history.past.push(focus ?? null)
      if (focus) after = snapshotSheetId(snapshot.workbook, after, focus.after)
    } else {
      history.past.push(operation.kind === 'workbook' ? { before: currentSheetId, after } : null)
      history.future.length = 0
    }
  }
  history.revision = snapshot.revision
  if (!snapshot.canUndo) history.past.length = 0
  if (!snapshot.canRedo) history.future.length = 0
  if (history.past.length > 100) history.past.splice(0, history.past.length - 100)
  if (history.future.length > 100) history.future.splice(0, history.future.length - 100)
  return after
}
