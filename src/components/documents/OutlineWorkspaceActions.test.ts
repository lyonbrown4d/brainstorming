import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook, type MindMapWorkbook } from '@core'
import type { ComputeAPI, EditorOperation, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({
  compute: null as Pick<ComputeAPI, 'openSession' | 'executeSession' | 'closeSession'> | null,
}))
vi.mock('@renderer/lib/desktop', () => ({ getPlatformAPI: () => ({ compute: platform.compute }) }))

import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useSelection } from '@renderer/state/selection'
import { loadWorkbook } from '@renderer/state/workbookState'
import { flushNativeEditor, releaseNativeEditor } from '@renderer/state/nativeEditorQueue'
import {
  addOutlineTopic,
  indentOutlineSelection,
  setOutlineWorkspaceOpen,
} from '@renderer/components/documents/OutlineWorkspaceActions'
import {
  outlineSessionKey,
  updateOutlineSession,
  useOutlineWorkspaceState,
} from '@renderer/components/documents/OutlineWorkspaceState'

const deferred = () => {
  let release: () => void = vi.fn()
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const snapshot = (book: MindMapWorkbook, revision: number): NativeEditorSnapshot => ({
  sessionId: book.id,
  revision: String(revision),
  workbook: book,
  canUndo: revision > 0,
  canRedo: false,
})

let book: MindMapWorkbook
let rename = deferred()
let move = deferred()
const operations: EditorOperation[] = []
const sessionKey = () => outlineSessionKey(book.id, useEditor.getState().activeSheetId)

beforeEach(() => {
  book = createWorkbook(
    applyCommand(createDocument('Root'), {
      type: 'batch',
      commands: [
        { type: 'addTopic', parentId: 'root', id: 'first', title: 'First' },
        { type: 'addTopic', parentId: 'root', id: 'second', title: 'Second' },
      ],
    }),
  )
  rename = deferred()
  move = deferred()
  operations.length = 0
  let authoritative = book
  let revision = 0
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(book, 0)),
    executeSession: async (_id, _revision, operation) => {
      if (operation.kind !== 'topic') throw new Error('Unexpected editor operation')
      operations.push(operation)
      authoritative = {
        ...authoritative,
        sheets: authoritative.sheets.map((sheet) =>
          sheet.id === operation.sheetId
            ? { ...sheet, document: applyCommand(sheet.document, operation.command) }
            : sheet,
        ),
      }
      revision += 1
      const next = snapshot(authoritative, revision)
      await (operation.command.type === 'renameTopic' ? rename.promise : move.promise)
      return next
    },
    closeSession: () => Promise.resolve(),
  }
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useEditor.setState({
    ...loadWorkbook(book),
    selectedId: 'second',
    editingId: null,
    editingSurface: null,
    draft: '',
    busy: false,
    error: null,
  })
  useSelection.setState({
    sheets: { [useEditor.getState().activeSheetId]: ['second'] },
    drawings: {},
  })
  useOutlineWorkspaceState.setState({ sessions: {} })
  updateOutlineSession(sessionKey(), { open: true })
  // Closing schedules DOM focus; this node-level queue regression does not mount a window.
  vi.stubGlobal('requestAnimationFrame', () => 0)
})

afterEach(async () => {
  rename.release()
  move.release()
  await releaseNativeEditor(book.id)
  platform.compute = null
  useOutlineWorkspaceState.setState({ sessions: {} })
  vi.unstubAllGlobals()
})

it('restores outline editing after the native hierarchy command is acknowledged', async () => {
  useEditor.getState().startEdit('second', undefined, 'outline')
  indentOutlineSelection(1, true)
  await vi.waitFor(() => {
    expect(operations).toHaveLength(1)
  })
  expect(useEditor.getState().editingId).toBeNull()
  move.release()
  await flushNativeEditor(book.id)
  await vi.waitFor(() => {
    expect(useEditor.getState().editingId).toBe('second')
    expect(useEditor.getState().editingSurface).toBe('outline')
  })
  expect(useEditor.getState().history.document.topics.first?.children).toEqual(['second'])
})

it('does not reopen an outline closed while the renamed title and indentation are queued', async () => {
  useEditor.getState().startEdit('second', undefined, 'outline')
  useEditor.getState().setDraft('Renamed')
  indentOutlineSelection(1, true)
  await vi.waitFor(() => {
    expect(operations).toHaveLength(1)
  })
  setOutlineWorkspaceOpen(false)
  rename.release()
  await vi.waitFor(() => {
    expect(operations).toHaveLength(2)
    expect(useOutlineWorkspaceState.getState().sessions[sessionKey()]?.open).toBe(false)
  })
  move.release()
  await flushNativeEditor(book.id)
  await Promise.resolve()
  const current = useEditor.getState()
  expect(current.history.document.topics.second?.title).toBe('Renamed')
  expect(current.history.document.topics.first?.children).toEqual(['second'])
  expect(current.editingId).toBeNull()
})

it('keeps a newer selection instead of restoring the old outline editor after acknowledgment', async () => {
  indentOutlineSelection(1, true)
  await vi.waitFor(() => {
    expect(operations).toHaveLength(1)
  })
  useEditor.getState().select('first')
  move.release()
  await flushNativeEditor(book.id)
  await Promise.resolve()
  expect(useEditor.getState().selectedId).toBe('first')
  expect(useEditor.getState().editingId).toBeNull()
  expect(useEditor.getState().history.document.topics.first?.children).toEqual(['second'])
})

it('does not reopen a new-topic editor after the outline closes while native creation is queued', async () => {
  useEditor.getState().startEdit('second', undefined, 'outline')
  useEditor.getState().setDraft('Renamed')
  addOutlineTopic('sibling')
  await vi.waitFor(() => {
    expect(operations).toHaveLength(1)
  })
  setOutlineWorkspaceOpen(false)
  rename.release()
  await vi.waitFor(() => {
    expect(operations).toHaveLength(2)
    expect(useOutlineWorkspaceState.getState().sessions[sessionKey()]?.open).toBe(false)
  })
  move.release()
  await flushNativeEditor(book.id)
  await Promise.resolve()
  expect(useEditor.getState().history.document.topics.root?.children).toHaveLength(3)
  expect(useEditor.getState().editingId).toBeNull()
})

it('does not steal a newer selection when a newly created outline topic is acknowledged', async () => {
  addOutlineTopic('sibling')
  await vi.waitFor(() => {
    expect(operations).toHaveLength(1)
  })
  useEditor.getState().select('first')
  move.release()
  await flushNativeEditor(book.id)
  await Promise.resolve()
  expect(useEditor.getState().history.document.topics.root?.children).toHaveLength(3)
  expect(useEditor.getState().selectedId).toBe('first')
  expect(useEditor.getState().editingId).toBeNull()
})
