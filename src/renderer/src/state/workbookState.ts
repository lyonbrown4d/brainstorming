import {
  createHistory,
  createWorkbook,
  redo,
  serializeWorkbook,
  undo,
  type HistoryState,
  type MindMapDocument,
  type MindMapWorkbook,
} from '@core'
import type { EditorData, SheetSession, StructureSnapshot } from './editorTypes'

export function sessionFor(document: MindMapDocument): SheetSession {
  return {
    history: createHistory(document),
    selectedId: document.rootId,
    undoOrder: [],
    redoOrder: [],
  }
}
export function loadWorkbook(
  document: MindMapDocument | MindMapWorkbook,
): StructureSnapshot & { history: HistoryState; selectedId: string } {
  const workbook = document.version === 1 ? createWorkbook(document) : document
  const first = workbook.sheets[0]
  if (!first) throw new Error('工作簿至少需要一个画布')
  const sessions = Object.fromEntries(
    workbook.sheets.map((sheet) => [sheet.id, sessionFor(sheet.document)]),
  )
  const session = sessions[first.id]
  if (!session) throw new Error('无法初始化画布')
  return {
    workbook,
    activeSheetId: first.id,
    sessions,
    history: session.history,
    selectedId: session.selectedId,
  }
}
export function snapshot(state: EditorData): StructureSnapshot {
  return {
    workbook: state.workbook,
    activeSheetId: state.activeSheetId,
    sessions: {
      ...state.sessions,
      [state.activeSheetId]: {
        ...(state.sessions[state.activeSheetId] ?? sessionFor(state.history.document)),
        history: state.history,
        selectedId: state.selectedId,
      },
    },
  }
}
export function withHistory(
  state: EditorData,
  history: HistoryState,
  session: SheetSession,
): Partial<EditorData> {
  const selectedId = history.document.topics[state.selectedId]
    ? state.selectedId
    : history.document.rootId
  return {
    history,
    selectedId,
    workbook: {
      ...state.workbook,
      sheets: state.workbook.sheets.map((sheet) =>
        sheet.id === state.activeSheetId ? { ...sheet, document: history.document } : sheet,
      ),
    },
    sessions: { ...state.sessions, [state.activeSheetId]: { ...session, history, selectedId } },
  }
}

/** Restoring sheet order/names must preserve later content edits in surviving sheets. */
export function restoreStructure(
  state: EditorData,
  target: StructureSnapshot,
): Partial<EditorData> {
  const current = snapshot(state)
  const sessions = Object.fromEntries(
    target.workbook.sheets.map((sheet) => [
      sheet.id,
      current.sessions[sheet.id] ?? target.sessions[sheet.id] ?? sessionFor(sheet.document),
    ]),
  )
  const active = sessions[target.activeSheetId]
  if (!active) throw new Error('无法恢复画布')
  return {
    workbook: {
      ...target.workbook,
      sheets: target.workbook.sheets.map((sheet) => ({
        ...sheet,
        document: sessions[sheet.id]?.history.document ?? sheet.document,
      })),
    },
    sessions,
    activeSheetId: target.activeSheetId,
    history: active.history,
    selectedId: active.selectedId,
    editingId: null,
    editingSurface: null,
    draft: '',
    dropTargetId: null,
  }
}
export function travelHistory(state: EditorData, direction: 'undo' | 'redo'): Partial<EditorData> {
  const session = state.sessions[state.activeSheetId] ?? sessionFor(state.history.document)
  const backwards = direction === 'undo'
  const structural = backwards ? state.structurePast.at(-1) : state.structureFuture[0]
  const contentOrder = backwards ? session.undoOrder.at(-1) : session.redoOrder[0]
  if (
    structural &&
    (contentOrder === undefined ||
      (backwards ? structural.order > contentOrder : structural.order < contentOrder))
  ) {
    const current = snapshot(state)
    const recorded = backwards
      ? {
          ...structural,
          after: {
            ...structural.after,
            sessions: { ...structural.after.sessions, ...current.sessions },
          },
        }
      : {
          ...structural,
          before: {
            ...structural.before,
            sessions: { ...structural.before.sessions, ...current.sessions },
          },
        }
    return {
      ...restoreStructure(state, backwards ? structural.before : structural.after),
      structurePast: backwards
        ? state.structurePast.slice(0, -1)
        : [...state.structurePast, recorded],
      structureFuture: backwards
        ? [recorded, ...state.structureFuture]
        : state.structureFuture.slice(1),
    }
  }
  const history = backwards ? undo(state.history) : redo(state.history)
  if (history === state.history) return {}
  return withHistory(state, history, {
    ...session,
    undoOrder: backwards
      ? session.undoOrder.slice(0, -1)
      : [...session.undoOrder, contentOrder ?? 0].slice(-100),
    redoOrder: backwards ? [contentOrder ?? 0, ...session.redoOrder] : session.redoOrder.slice(1),
  })
}
const cache = new WeakMap<MindMapWorkbook, string>()
export function serializedWorkbook(workbook: MindMapWorkbook): string {
  let contents = cache.get(workbook)
  if (contents === undefined) {
    contents = serializeWorkbook(workbook)
    cache.set(workbook, contents)
  }
  return contents
}
