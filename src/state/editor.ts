import { translate } from '@renderer/i18n'
import { create } from 'zustand'
import { createDocument, executeCommand } from '@core'
import type { EditorState } from '@renderer/state/editorTypes'
import {
  loadWorkbook,
  serializedWorkbook,
  sessionFor,
  travelHistory,
  withHistory,
} from '@renderer/state/workbookState'
import { usePresentation } from '@renderer/state/presentation'
import { enterWorkspaceEditor } from '@renderer/state/workspace'
import { draftCommand, emptyEditorDraft } from '@renderer/state/editorDraft'
import { deleteSelectedTopics, useSelection } from '@renderer/state/selection'
import { addTopic } from '@renderer/state/topicCreation'
import { dispatchNativeEditor } from '@renderer/state/nativeEditorBridge'
import {
  flushNativeEditor,
  forgetNativeEditor,
  hasNativeEditor,
  hasPendingNativeEditor,
} from '@renderer/state/nativeEditorQueue'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { addDocumentSheet, editSheets } from '@renderer/state/sheetEditing'
import { switchSheet } from '@renderer/state/sheetNavigation'

export { addDocumentSheet } from '@renderer/state/sheetEditing'
export { editorIsDirty, isDirty } from '@renderer/state/editorDirty'

const initial = loadWorkbook(createDocument('未命名'))
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
      drawings: { ...selection.drawings, [get().activeSheetId]: [] },
    }))
    set({ selectedId: id })
  },
  startEdit: (id, value, surface = 'canvas', selection = 'all') => {
    if (usePresentation.getState().playing) return
    if (get().editingId === id && get().editingSurface === surface) return
    get().commitDraft()
    if (get().editingId) return
    if (hasNativeEditor() && hasPendingNativeEditor(get().workbook.id)) {
      const workbookId = get().workbook.id
      const sheetId = get().activeSheetId
      void flushNativeEditor(workbookId)
        .then(() => {
          const current = useEditor.getState()
          if (current.workbook.id === workbookId && current.activeSheetId === sheetId)
            current.startEdit(id, value, surface, selection)
        })
        .catch((error: unknown) => {
          if (get().workbook.id === workbookId)
            get().setError(error instanceof Error ? error.message : String(error))
        })
      return
    }
    const topic = get().history.document.topics[id]
    if (topic) {
      const ids = useSelection.getState().sheets[get().activeSheetId]
      if (ids && (ids.length !== 1 || ids[0] !== id))
        useSelection.setState((selection) => ({
          sheets: { ...selection.sheets, [get().activeSheetId]: [id] },
          drawings: { ...selection.drawings, [get().activeSheetId]: [] },
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
    const before = get()
    if (before.editingId === null) return
    const command = draftCommand(before)
    if (
      command &&
      !get().command(command, () => {
        const restored = {
          selectedId: before.selectedId,
          editingId: before.editingId,
          editingSurface: before.editingSurface,
          editingPageIndex: before.editingPageIndex,
          draft: before.draft,
          richDraft: before.richDraft,
          editSelection: before.editSelection,
        }
        if (get().workbook.id === before.workbook.id && get().editingId === null) set(restored)
        useDocumentTabs.setState((tabs) => ({
          tabs: tabs.tabs.map((tab) =>
            tab.editor.workbook.id === before.workbook.id
              ? { ...tab, editor: { ...tab.editor, ...restored } }
              : tab,
          ),
        }))
      })
    )
      return
    set(emptyEditorDraft)
  },
  cancelEdit: () => {
    set(emptyEditorDraft)
  },
  command: (command, onFailure, onAck) => {
    if (usePresentation.getState().playing) return false
    if (hasNativeEditor()) {
      const state = get()
      const accepted = dispatchNativeEditor(
        state.workbook,
        {
          kind: 'topic',
          sheetId: state.activeSheetId,
          command,
        },
        { onFailure, afterAck: onAck },
      )
      if (accepted) set({ clock: state.clock + 1 })
      return accepted
    }
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
    if (hasNativeEditor()) {
      const state = get()
      if (dispatchNativeEditor(state.workbook, { kind: 'undo' })) set({ clock: state.clock + 1 })
      return
    }
    set(travelHistory(get(), 'undo'))
  },
  redo: () => {
    if (usePresentation.getState().playing) return
    get().commitDraft()
    if (get().editingId) return
    if (hasNativeEditor()) {
      const state = get()
      if (dispatchNativeEditor(state.workbook, { kind: 'redo' })) set({ clock: state.clock + 1 })
      return
    }
    set(travelHistory(get(), 'redo'))
  },
  replace: (document, path = null, recovered = false) => {
    const loaded = loadWorkbook(document)
    forgetNativeEditor(loaded.workbook.id)
    useSelection.setState({ sheets: {}, drawings: {} })
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
  switchSheet,
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
