import { applyCommand, type MindMapWorkbook } from '@core'
import type { EditorData } from '@renderer/state/editorTypes'
import { draftCommand } from '@renderer/state/editorDraft'
import { serializedWorkbook } from '@renderer/state/workbookState'

export type SnapshotIdentity = Pick<
  EditorData,
  | 'workbook'
  | 'activeSheetId'
  | 'editingId'
  | 'editingSurface'
  | 'editingPageIndex'
  | 'draft'
  | 'richDraft'
>
const snapshots = new WeakMap<MindMapWorkbook, { identity: SnapshotIdentity; contents: string }>()
export const snapshotIdentity = (state: EditorData): SnapshotIdentity => ({
  workbook: state.workbook,
  activeSheetId: state.activeSheetId,
  editingId: state.editingId,
  editingSurface: state.editingSurface,
  editingPageIndex: state.editingPageIndex,
  draft: state.draft,
  richDraft: state.richDraft,
})
export const sameSnapshot = (left: SnapshotIdentity | null, right: SnapshotIdentity): boolean =>
  left !== null &&
  left.workbook === right.workbook &&
  left.activeSheetId === right.activeSheetId &&
  left.editingId === right.editingId &&
  left.editingSurface === right.editingSurface &&
  left.editingPageIndex === right.editingPageIndex &&
  left.draft === right.draft &&
  left.richDraft === right.richDraft

/** Serialization is a save-boundary operation; UI-only state changes reuse the same snapshot. */
export const serializedDocumentSnapshot = (state: EditorData): string => {
  const identity = snapshotIdentity(state)
  const cached = snapshots.get(state.workbook)
  if (cached && sameSnapshot(cached.identity, identity)) return cached.contents
  const draft = draftCommand(state)
  if (!draft) return serializedWorkbook(state.workbook)
  const document = applyCommand(state.history.document, draft)
  const contents = serializedWorkbook({
    ...state.workbook,
    sheets: state.workbook.sheets.map((sheet) =>
      sheet.id === state.activeSheetId ? { ...sheet, document } : sheet,
    ),
  })
  snapshots.set(state.workbook, { identity, contents })
  return contents
}

/** Typing dirtiness does not materialize a candidate workbook on every keystroke. */
export const snapshotIsDirty = (state: EditorData): boolean => {
  if (draftCommand(state) === null) return serializedWorkbook(state.workbook) !== state.baseline
  const cached = snapshots.get(state.workbook)
  return (
    !cached ||
    !sameSnapshot(cached.identity, snapshotIdentity(state)) ||
    cached.contents !== state.baseline
  )
}
