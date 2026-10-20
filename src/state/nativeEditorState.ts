import { isEqual } from 'lodash-es'
import type { MindMapDocument, MindMapWorkbook } from '@core'
import type { NativeEditorSnapshot } from '@shared/compute'
import type { EditorState, SheetSession } from '@renderer/state/editorTypes'
import { sessionFor } from '@renderer/state/workbookState'

const shareDocument = (
  old: MindMapDocument | undefined,
  next: MindMapDocument,
): MindMapDocument => {
  if (!old) return next
  const topics = Object.fromEntries(
    Object.entries(next.topics).map(([id, topic]) => [
      id,
      old.topics[id] && isEqual(old.topics[id], topic) ? old.topics[id] : topic,
    ]),
  )
  const shared = { ...next, topics }
  return isEqual(old, shared) ? old : shared
}

const shareWorkbook = (old: MindMapWorkbook, next: MindMapWorkbook): MindMapWorkbook => {
  const oldSheets = new Map(old.sheets.map((sheet) => [sheet.id, sheet]))
  const sheets = next.sheets.map((sheet) => {
    const prior = oldSheets.get(sheet.id)
    const document = shareDocument(prior?.document, sheet.document)
    return prior?.name === sheet.name && document === prior.document
      ? prior
      : { ...sheet, document }
  })
  return old.title === next.title &&
    old.sheets.length === sheets.length &&
    sheets.every((sheet, index) => sheet === old.sheets[index])
    ? old
    : { ...next, sheets }
}

export const snapshotSheetId = (
  workbook: MindMapWorkbook,
  currentSheetId: string,
  requestedSheetId?: string,
): string => {
  const id =
    requestedSheetId && workbook.sheets.some((sheet) => sheet.id === requestedSheetId)
      ? requestedSheetId
      : workbook.sheets.some((sheet) => sheet.id === currentSheetId)
        ? currentSheetId
        : workbook.sheets[0]?.id
  if (!id) throw new Error('工作簿至少需要一个画布')
  return id
}

/** Only the Rust availability flags are represented in UI history arrays. */
export const applyNativeEditorSnapshot = (
  state: EditorState,
  snapshot: NativeEditorSnapshot,
  nextSheetId?: string,
): Partial<EditorState> => {
  const workbook = shareWorkbook(state.workbook, snapshot.workbook)
  const activeSheetId = snapshotSheetId(workbook, state.activeSheetId, nextSheetId)
  const sessions = Object.fromEntries(
    workbook.sheets.map((sheet): [string, SheetSession] => {
      const previous = state.sessions[sheet.id] ?? sessionFor(sheet.document)
      const selectedId = sheet.document.topics[previous.selectedId]
        ? previous.selectedId
        : sheet.document.rootId
      return [
        sheet.id,
        {
          ...previous,
          selectedId,
          history: {
            document: sheet.document,
            past: snapshot.canUndo ? [sheet.document] : [],
            future: snapshot.canRedo ? [sheet.document] : [],
          },
          undoOrder: [],
          redoOrder: [],
        },
      ]
    }),
  )
  const active = sessions[activeSheetId]
  if (!active) throw new Error('活动画布不存在')
  const selectedId =
    state.activeSheetId === activeSheetId && active.history.document.topics[state.selectedId]
      ? state.selectedId
      : active.selectedId
  return {
    workbook,
    activeSheetId,
    sessions: { ...sessions, [activeSheetId]: { ...active, selectedId } },
    history: active.history,
    selectedId,
    structurePast: [],
    structureFuture: [],
    clock: state.clock + (workbook === state.workbook ? 0 : 1),
    error: null,
  }
}
