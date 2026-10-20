import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createWorkbook,
  type MindMapWorkbook,
} from '@core'
import type { ComputeAPI, EditorOperation, NativeEditorSnapshot } from '@shared/compute'
import { desktop } from '@tests/fixtures/desktop'
import { useEditor } from '@renderer/state/editor'
import { openDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import { useTopicFocusRequest } from '@renderer/state/viewport'
import { revealSearchMatch, replaceSearchResults, useSearch } from '@renderer/state/search'
import { startContentIndexSync } from '@renderer/state/contentIndex'
import { flushNativeEditor, forgetNativeEditor } from '@renderer/state/nativeEditorQueue'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve()
}
let stop: (() => void) | undefined
const ids = new Set<string>()
beforeEach(() => {
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useTopicFocusRequest.setState({ request: null, sequence: 0 })
  useSearch.setState({
    query: '',
    replacement: '',
    matchCase: false,
    wholeWord: false,
    includeNotes: true,
    allSheets: false,
  })
})
afterEach(async () => {
  stop?.()
  stop = undefined
  for (const id of ids) forgetNativeEditor(id)
  ids.clear()
  await settle()
})
const nativeEditor = (initial: MindMapWorkbook, gates: Promise<void>[]) => {
  ids.add(initial.id)
  let book = initial
  let revision = 0
  const snapshot = (): NativeEditorSnapshot => ({
    sessionId: book.id,
    revision: String(revision),
    workbook: book,
    canUndo: revision > 0,
    canRedo: false,
  })
  const executeSession = vi.fn(
    async (_id: string, _revision: string, operation: EditorOperation) => {
      await gates.shift()
      if (operation.kind === 'topic') {
        book = {
          ...book,
          sheets: book.sheets.map((sheet) =>
            sheet.id === operation.sheetId
              ? { ...sheet, document: applyCommand(sheet.document, operation.command) }
              : sheet,
          ),
        }
      } else if (operation.kind === 'workbook') book = applyWorkbookCommand(book, operation.command)
      revision += 1
      return snapshot()
    },
  )
  const find = vi.fn<ComputeAPI['find']>(() => Promise.resolve([]))
  const compute = {
    openSession: () => Promise.resolve(snapshot()),
    executeSession,
    closeSession: () => Promise.resolve(),
    find,
  } as unknown as ComputeAPI
  desktop({ compute })
  openDocumentTab(book)
  return { compute, executeSession, find }
}

it('waits for the outgoing draft, changes Sheet, then focuses only after ancestors expand', async () => {
  const target = applyCommand(
    applyCommand(createDocument('Target', 'target'), {
      type: 'addTopic',
      parentId: 'root',
      id: 'child',
      title: 'Found',
    }),
    { type: 'toggleCollapse', topicId: 'root' },
  )
  const book = applyWorkbookCommand(createWorkbook(createDocument('Outgoing', 'search-outgoing')), {
    type: 'addSheet',
    sheet: { id: 'target-sheet', name: 'Target', document: target },
  })
  const draft = deferred<undefined>()
  const expand = deferred<undefined>()
  const { executeSession } = nativeEditor(book, [draft.promise, expand.promise])
  useEditor.getState().startEdit('root')
  useEditor.getState().setDraft('Preserved outgoing draft')
  expect(
    revealSearchMatch({
      sheetId: 'target-sheet',
      topicId: 'child',
      field: 'title',
      text: 'Found',
      count: 1,
    }),
  ).toBe(true)
  await settle()
  expect(executeSession).toHaveBeenCalledTimes(1)
  expect(useEditor.getState().activeSheetId).toBe('search-outgoing')
  expect(useTopicFocusRequest.getState().request).toBeNull()
  draft.resolve(undefined)
  await settle()
  expect(useEditor.getState().activeSheetId).toBe('target-sheet')
  expect(useEditor.getState().selectedId).toBe('root')
  expect(useEditor.getState().history.document.topics.root?.collapsed).toBe(true)
  expect(useTopicFocusRequest.getState().request).toBeNull()
  expand.resolve(undefined)
  await flushNativeEditor(book.id)
  expect(useEditor.getState().selectedId).toBe('child')
  expect(useEditor.getState().history.document.topics.root?.collapsed).toBe(false)
  expect(useEditor.getState().workbook.sheets[0]?.document.title).toBe('Preserved outgoing draft')
  expect(useTopicFocusRequest.getState().request).toMatchObject({
    sheetId: 'target-sheet',
    topicId: 'child',
    document: useEditor.getState().history.document,
  })
})

it('ignores stale replacement input and resolves a fresh replacement only after its native acknowledgment', async () => {
  const book = createWorkbook(createDocument('cat cat', 'search-replacement'))
  const ack = deferred<undefined>()
  const { find, executeSession } = nativeEditor(book, [ack.promise])
  stop = startContentIndexSync()
  const firstFind = deferred<Awaited<ReturnType<ComputeAPI['find']>>>()
  const match = {
    sheetId: 'search-replacement',
    topicId: 'root',
    field: 'title' as const,
    text: 'cat cat',
    count: 2,
  }
  find.mockImplementationOnce(() => firstFind.promise).mockResolvedValue([match])
  useSearch.setState({ query: 'cat', replacement: 'dog' })
  const stale = replaceSearchResults()
  await settle()
  useSearch.setState({ replacement: 'fox' })
  firstFind.resolve([match])
  await stale
  expect(executeSession).not.toHaveBeenCalled()
  useSearch.setState({ replacement: 'dog' })
  let complete = false
  const pending = Promise.resolve(replaceSearchResults()).then(() => {
    complete = true
  })
  await settle()
  expect(executeSession).toHaveBeenCalledOnce()
  expect(complete).toBe(false)
  expect(useEditor.getState().history.document.title).toBe('cat cat')
  expect(executeSession.mock.calls[0]?.[2]).toMatchObject({
    kind: 'topic',
    command: {
      type: 'batch',
      commands: [{ type: 'replaceTopicText', topicId: 'root', query: 'cat', replacement: 'dog' }],
    },
  })
  ack.resolve(undefined)
  await pending
  expect(useEditor.getState().history.document.title).toBe('dog dog')
})

it('does not steal selection when the user moves to another topic before unfolding finishes', async () => {
  let document = createDocument('Root', 'search-selection')
  for (const id of ['child', 'other'])
    document = applyCommand(document, { type: 'addTopic', id, parentId: 'root', title: id })
  document = applyCommand(document, { type: 'toggleCollapse', topicId: 'root' })
  const book = createWorkbook(document)
  const ack = deferred<undefined>()
  nativeEditor(book, [ack.promise])
  revealSearchMatch({
    sheetId: 'search-selection',
    topicId: 'child',
    field: 'title',
    text: 'child',
    count: 1,
  })
  await settle()
  useEditor.getState().select('other')
  ack.resolve(undefined)
  await flushNativeEditor(book.id)
  expect(useEditor.getState().selectedId).toBe('other')
  expect(useEditor.getState().history.document.topics.root?.collapsed).toBe(false)
  expect(useTopicFocusRequest.getState().request).toBeNull()
})
