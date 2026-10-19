import { applyCommand } from '@core'
import type { EditorData } from '@renderer/state/editorTypes'
import { draftCommand } from '@renderer/state/editorDraft'
import { serializedWorkbook } from '@renderer/state/workbookState'

const snapshots = new WeakMap<EditorData, string>()

/** Project the active editor draft without committing history, selection or composition. */
export const serializedDocumentSnapshot = (state: EditorData): string => {
  const cached = snapshots.get(state)
  if (cached !== undefined) return cached
  const draft = draftCommand(state)
  if (!draft) return serializedWorkbook(state.workbook)
  const document = applyCommand(state.history.document, draft)
  const contents = serializedWorkbook({
    ...state.workbook,
    sheets: state.workbook.sheets.map((sheet) =>
      sheet.id === state.activeSheetId ? { ...sheet, document } : sheet,
    ),
  })
  snapshots.set(state, contents)
  return contents
}
