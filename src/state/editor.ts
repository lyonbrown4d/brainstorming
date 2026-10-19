import { translate } from '@renderer/i18n'
import { create } from 'zustand'
import { truncateSheetName } from '@core/workbook'
import {
  createDocument,
  applyWorkbookCommand,
  executeCommand,
  type WorkbookCommand,
  type MindMapDocument,
} from '@core'
import type { EditorState } from '@renderer/state/editorTypes'
import {
  loadWorkbook,
  serializedWorkbook,
  sessionFor,
  snapshot,
  restoreStructure,
  travelHistory,
  withHistory,
} from '@renderer/state/workbookState'
import { usePresentation } from '@renderer/state/presentation'
import { enterWorkspaceEditor } from '@renderer/state/workspace'
import { draftCommand, emptyEditorDraft } from '@renderer/state/editorDraft'
import { serializedDocumentSnapshot } from '@renderer/state/documentSnapshot'
import { deleteSelectedTopics, useSelection } from '@renderer/state/selection'
import { addTopic } from '@renderer/state/topicCreation'

const initial = loadWorkbook(createDocument('未命名'))
const editSheets = (command: WorkbookCommand, nextId?: string): void => {
  const state = useEditor.getState()
  if (usePresentation.getState().playing) return
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const current = useEditor.getState()
  try {
    const before = snapshot(current)
    const workbook = applyWorkbookCommand(current.workbook, command)
    if (workbook === current.workbook) return
    const activeSheetId =
      nextId ??
      (workbook.sheets.some((sheet) => sheet.id === current.activeSheetId)
        ? current.activeSheetId
        : workbook.sheets[0]?.id)
    if (!activeSheetId) throw new Error(translate('aWorkbookNeedsAtLeastOneSheet'))
    const sessions = Object.fromEntries(
      workbook.sheets.map((sheet) => [
        sheet.id,
        before.sessions[sheet.id] ?? sessionFor(sheet.document),
      ]),
    )
    const after = { workbook, activeSheetId, sessions }
    useEditor.setState({
      ...restoreStructure(current, after),
      workbook,
      sessions,
      clock: current.clock + 1,
      structurePast: [...current.structurePast, { before, after, order: current.clock + 1 }].slice(
        -100,
      ),
      structureFuture: [],
      error: null,
    })
  } catch (error) {
    state.setError(error instanceof Error ? error.message : translate('sheetOperationFailed'))
  }
}
export const addDocumentSheet = (document: MindMapDocument): boolean => {
  if (useEditor.getState().busy) return false
  const id = crypto.randomUUID()
  const name =
    truncateSheetName(document.title.replace(/[\p{Cc}]/gu, ' ').trim()) ||
    translate('newSheetLabel402')
  editSheets(
    { type: 'addSheet', sheet: { id, name, document: { ...document, id: crypto.randomUUID() } } },
    id,
  )
  return useEditor.getState().activeSheetId === id
}
export const useEditor = create<EditorState>((set, get) => ({
  ...initial,
  dropTargetId: null,
  ...emptyEditorDraft,
  editSelection: 'all',
  baseline: serializedWorkbook(initial.workbook),
  path: null,
  error: null,
  busy: false,
  recovery: null,
  importReport: null,
  outlineOpen: false,
  inspectorOpen: false,
  inspectorMode: 'topic',
  canvasSection: 'structure',
  views: {},
  clock: 0,
  structurePast: [],
  structureFuture: [],
  select: (id) => {
    get().commitDraft()
    if (get().editingId) return
    useSelection.setState((selection) => ({
      sheets: { ...selection.sheets, [get().activeSheetId]: [id] },
    }))
    set({ selectedId: id })
  },
  startEdit: (id, value, surface = 'canvas', selection = 'all') => {
    if (usePresentation.getState().playing) return
    if (get().editingId === id && get().editingSurface === surface) return
    get().commitDraft()
    if (get().editingId) return
    const topic = get().history.document.topics[id]
    if (topic) {
      const ids = useSelection.getState().sheets[get().activeSheetId]
      if (ids && (ids.length !== 1 || ids[0] !== id))
        useSelection.setState((selection) => ({
          sheets: { ...selection.sheets, [get().activeSheetId]: [id] },
        }))
    }
    if (topic)
      set({
        selectedId: id,
        editingId: id,
        editingSurface: surface,
        editingPageIndex: null,
        ...(surface === 'inspector' ? { inspectorMode: 'topic' as const } : {}),
        editSelection: selection,
        richDraft: surface === 'rich-title' ? (topic.metadata?.richTitle ?? topic.title) : null,
        draft: value ?? (surface === 'notes' ? (topic.notes ?? '') : topic.title),
      })
  },
  setDraft: (draft) => {
    set({ draft })
  },
  setRichDraft: (richDraft, draft) => {
    set({ richDraft, draft })
  },
  commitDraft: () => {
    const command = draftCommand(get())
    if (command && !get().command(command)) return
    set(emptyEditorDraft)
  },
  cancelEdit: () => {
    set(emptyEditorDraft)
  },
  command: (command) => {
    if (usePresentation.getState().playing) return false
    try {
      const state = get()
      const history = executeCommand(state.history, command)
      if (history !== state.history) {
        const ids = useSelection.getState().sheets[state.activeSheetId]
        if (ids)
          useSelection.setState((selection) => ({
            sheets: {
              ...selection.sheets,
              [state.activeSheetId]: ids.filter((id) => history.document.topics[id]),
            },
          }))
        const session = state.sessions[state.activeSheetId] ?? sessionFor(state.history.document)
        set({
          ...withHistory(state, history, {
            ...session,
            undoOrder: [...session.undoOrder, state.clock + 1].slice(-100),
            redoOrder: [],
          }),
          clock: state.clock + 1,
          structureFuture: [],
          error: null,
        })
      }
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : translate('operationFailedPleaseRetry'),
      })
      return false
    }
  },
  add: addTopic,
  remove: deleteSelectedTopics,
  undo: () => {
    if (usePresentation.getState().playing) return
    get().commitDraft()
    if (get().editingId) return
    set(travelHistory(get(), 'undo'))
  },
  redo: () => {
    if (usePresentation.getState().playing) return
    get().commitDraft()
    if (get().editingId) return
    set(travelHistory(get(), 'redo'))
  },
  replace: (document, path = null, recovered = false) => {
    const loaded = loadWorkbook(document)
    useSelection.setState({ sheets: {} })
    set({
      ...loaded,
      ...emptyEditorDraft,
      baseline: recovered ? '' : serializedWorkbook(loaded.workbook),
      path,
      error: null,
      dropTargetId: null,
      importReport: null,
      inspectorMode: 'topic',
      canvasSection: 'structure',
      views: {},
      clock: 0,
      structurePast: [],
      structureFuture: [],
    })
    usePresentation.setState({
      cameraRequest: null,
      viewportRequest: null,
      steps: [],
      sheetId: null,
      workbookId: null,
      index: 0,
      generated: false,
    })
    enterWorkspaceEditor()
  },
  setError: (error) => {
    set({ error })
  },
  switchSheet: (id) => {
    if (id === get().activeSheetId) return
    get().commitDraft()
    if (get().editingId) return
    const state = get()
    const session = state.sessions[id]
    if (!session) {
      state.setError('画布不存在')
      return
    }
    set({
      sessions: snapshot(state).sessions,
      activeSheetId: id,
      history: session.history,
      selectedId: session.history.document.topics[session.selectedId]
        ? session.selectedId
        : session.history.document.rootId,
      ...emptyEditorDraft,
      dropTargetId: null,
      error: null,
    })
  },
  addDocumentSheet,
  addSheet: () => {
    const id = crypto.randomUUID()
    const names = new Set(get().workbook.sheets.map((sheet) => sheet.name))
    let index = get().workbook.sheets.length + 1
    while (names.has(`画布 ${index}`)) index += 1
    const name = `画布 ${index}`
    editSheets(
      {
        type: 'addSheet',
        sheet: { id, name, document: createDocument(translate('centralTopic'), id) },
      },
      id,
    )
  },
  renameSheet: (sheetId, name) => {
    editSheets({ type: 'renameSheet', sheetId, name })
  },
  duplicateSheet: (sheetId) => {
    const id = crypto.randomUUID()
    editSheets({ type: 'duplicateSheet', sheetId, id }, id)
  },
  deleteSheet: (sheetId) => {
    editSheets({ type: 'deleteSheet', sheetId })
  },
  moveSheet: (sheetId, index) => {
    editSheets({ type: 'moveSheet', sheetId, index })
  },
}))

export const editorIsDirty = (state: EditorState): boolean => {
  try {
    return serializedDocumentSnapshot(state) !== state.baseline
  } catch {
    return true
  }
}

export const isDirty = (): boolean => {
  return editorIsDirty(useEditor.getState())
}
