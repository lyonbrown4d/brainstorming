import { create } from 'zustand'
import {
  createDocument,
  applyWorkbookCommand,
  executeCommand,
  getParentId,
  type WorkbookCommand,
} from '@core'
import type { EditorState } from './editorTypes'
import {
  loadWorkbook,
  serializedWorkbook,
  sessionFor,
  snapshot,
  restoreStructure,
  travelHistory,
  withHistory,
} from './workbookState'
import { exampleWorkbook } from './example'

const initial = loadWorkbook(exampleWorkbook())
function editSheets(command: WorkbookCommand, nextId?: string): void {
  const state = useEditor.getState()
  state.commitDraft()
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
    if (!activeSheetId) throw new Error('工作簿至少需要一个画布')
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
    state.setError(error instanceof Error ? error.message : '画布操作失败')
  }
}
export const useEditor = create<EditorState>((set, get) => ({
  ...initial,
  dropTargetId: null,
  editingId: null,
  editingSurface: null,
  draft: '',
  baseline: serializedWorkbook(initial.workbook),
  path: null,
  error: null,
  busy: false,
  recovery: null,
  outlineOpen: false,
  inspectorOpen: false,
  views: {},
  clock: 0,
  structurePast: [],
  structureFuture: [],
  select: (id) => {
    get().commitDraft()
    set({ selectedId: id })
  },
  startEdit: (id, value, surface = 'canvas') => {
    if (get().editingId === id && get().editingSurface === surface) return
    get().commitDraft()
    const topic = get().history.document.topics[id]
    if (topic)
      set({ selectedId: id, editingId: id, editingSurface: surface, draft: value ?? topic.title })
  },
  setDraft: (draft) => {
    set({ draft })
  },
  commitDraft: () => {
    const { editingId, draft, history } = get()
    if (!editingId) return
    set({ editingId: null, editingSurface: null, draft: '' })
    if (history.document.topics[editingId]?.title !== draft.trim())
      get().command({
        type: 'renameTopic',
        topicId: editingId,
        title: draft.trim() || '未命名主题',
      })
  },
  cancelEdit: () => {
    set({ editingId: null, editingSurface: null, draft: '' })
  },
  command: (command) => {
    try {
      const state = get()
      const history = executeCommand(state.history, command)
      if (history !== state.history) {
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
      set({ error: error instanceof Error ? error.message : '操作失败，请重试。' })
      return false
    }
  },
  add: (kind) => {
    get().commitDraft()
    const {
      history: { document },
      selectedId,
    } = get()
    const parentId =
      kind === 'child' ? selectedId : (getParentId(document, selectedId) ?? selectedId)
    const parent = document.topics[parentId]
    if (!parent) return
    const id = crypto.randomUUID()
    const current = document.topics[selectedId]
    const side =
      parentId === document.rootId && selectedId === document.rootId
        ? parent.children.length % 2 === 0
          ? 'right'
          : 'left'
        : (current?.side ?? 'right')
    const index =
      kind === 'sibling' && selectedId !== document.rootId
        ? parent.children.indexOf(selectedId) + 1
        : parent.children.length
    if (get().command({ type: 'addTopic', parentId, id, title: '新主题', side, index }))
      get().startEdit(id)
  },
  remove: () => {
    get().commitDraft()
    const {
      history: { document },
      selectedId,
    } = get()
    const parent = getParentId(document, selectedId)
    if (parent && get().command({ type: 'deleteTopic', topicId: selectedId }))
      set({ selectedId: parent })
  },
  undo: () => {
    get().commitDraft()
    set(travelHistory(get(), 'undo'))
  },
  redo: () => {
    get().commitDraft()
    set(travelHistory(get(), 'redo'))
  },
  replace: (document, path = null, recovered = false) => {
    const loaded = loadWorkbook(document)
    set({
      ...loaded,
      editingId: null,
      editingSurface: null,
      draft: '',
      baseline: recovered ? '' : serializedWorkbook(loaded.workbook),
      path,
      error: null,
      dropTargetId: null,
      views: {},
      clock: 0,
      structurePast: [],
      structureFuture: [],
    })
  },
  setError: (error) => {
    set({ error })
  },
  switchSheet: (id) => {
    if (id === get().activeSheetId) return
    get().commitDraft()
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
      editingId: null,
      editingSurface: null,
      draft: '',
      dropTargetId: null,
      error: null,
    })
  },
  addSheet: () => {
    const id = crypto.randomUUID()
    const names = new Set(get().workbook.sheets.map((sheet) => sheet.name))
    let index = get().workbook.sheets.length + 1
    while (names.has(`画布 ${index}`)) index += 1
    const name = `画布 ${index}`
    editSheets(
      { type: 'addSheet', sheet: { id, name, document: createDocument('中心主题', id) } },
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

export function editorIsDirty(state: EditorState): boolean {
  return (
    serializedWorkbook(state.workbook) !== state.baseline ||
    (state.editingId !== null &&
      state.draft !== state.history.document.topics[state.editingId]?.title)
  )
}

export function isDirty(): boolean {
  return editorIsDirty(useEditor.getState())
}
