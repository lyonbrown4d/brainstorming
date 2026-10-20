import { afterEach, expect, it, vi } from 'vitest'
import { applyCommand, type MindMapWorkbook } from '@core'
import type { ComputeAPI, EditorOperation, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({ compute: null as ComputeAPI | null }))
vi.mock('@renderer/lib/desktop', () => ({ getPlatformAPI: () => ({ compute: platform.compute }) }))

import { editorIsDirty, useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { captureDocumentSession } from '@renderer/state/documentSession'
import { loadWorkbook, serializedWorkbook } from '@renderer/state/workbookState'
import { flushNativeEditor, forgetNativeEditor } from '@renderer/state/nativeEditorQueue'

const workbook = (id: string): MindMapWorkbook => ({
  format: 'brainstorming',
  version: 2,
  id,
  title: id,
  sheets: [
    {
      id: 'sheet',
      name: 'Sheet',
      document: {
        format: 'brainstorming',
        version: 1,
        id: `${id}-document`,
        title: 'Root',
        rootId: 'root',
        topics: {
          root: { id: 'root', title: 'Root', children: [], collapsed: false, side: 'right' },
        },
      },
    },
  ],
})

const withTopic = (book: MindMapWorkbook): MindMapWorkbook => ({
  ...book,
  sheets: book.sheets.map((sheet) => ({
    ...sheet,
    document: {
      ...sheet.document,
      topics: {
        ...sheet.document.topics,
        root: { id: 'root', title: 'Root', children: ['new'], collapsed: false, side: 'right' },
        new: { id: 'new', title: 'New', children: [], collapsed: false, side: 'right' },
      },
    },
  })),
})

const snapshot = (book: MindMapWorkbook, revision: string): NativeEditorSnapshot => ({
  sessionId: book.id,
  revision,
  workbook: book,
  canUndo: revision !== '0',
  canRedo: false,
})

const pendingSnapshot = () => {
  let resolve!: (value: NativeEditorSnapshot) => void
  const promise = new Promise<NativeEditorSnapshot>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const pendingFailure = () => {
  let reject!: (error: Error) => void
  const promise = new Promise<NativeEditorSnapshot>((_done, fail) => {
    reject = fail
  })
  return { promise, reject }
}

afterEach(() => {
  platform.compute = null
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  forgetNativeEditor('focus')
  forgetNativeEditor('hidden')
})

it('waits for a newly added topic before opening its editor', async () => {
  const book = workbook('focus')
  const pending = pendingSnapshot()
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(book, '0')),
    executeSession: async () => pending.promise,
  } as unknown as ComputeAPI
  useEditor.setState({ ...loadWorkbook(book), editingId: null, error: null })
  expect(
    useEditor.getState().command({ type: 'addTopic', parentId: 'root', id: 'new', title: 'New' }),
  ).toBe(true)
  useEditor.getState().startEdit('new')
  expect(useEditor.getState().editingId).toBeNull()
  pending.resolve(snapshot(withTopic(book), '1'))
  await flushNativeEditor(book.id)
  await Promise.resolve()
  expect(useEditor.getState().editingId).toBe('new')
})

it('applies a late acknowledgment to its original hidden tab', async () => {
  const original = workbook('hidden')
  const other = workbook('visible')
  const pending = pendingSnapshot()
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(original, '0')),
    executeSession: async () => pending.promise,
  } as unknown as ComputeAPI
  useEditor.setState({ ...loadWorkbook(original), editingId: null, error: null })
  const hidden = { ...captureDocumentSession(), id: 'tab-hidden' }
  useDocumentTabs.setState({ tabs: [hidden], activeId: 'tab-hidden', recovery: [] })
  expect(
    useEditor.getState().command({ type: 'addTopic', parentId: 'root', id: 'new', title: 'New' }),
  ).toBe(true)
  useEditor.setState({ ...loadWorkbook(other), editingId: null, error: null })
  const visible = { ...captureDocumentSession(), id: 'tab-visible' }
  useDocumentTabs.setState({ tabs: [hidden, visible], activeId: 'tab-visible' })
  pending.resolve(snapshot(withTopic(original), '1'))
  await flushNativeEditor(original.id)
  expect(useEditor.getState().workbook.id).toBe('visible')
  expect(useEditor.getState().history.document.topics.new).toBeUndefined()
  const updated = useDocumentTabs.getState().tabs.find((tab) => tab.id === 'tab-hidden')
  expect(updated?.editor.history.document.topics.new?.title).toBe('New')
})

it('restores a failed draft in its original tab and stops dependent edits', async () => {
  const original = workbook('hidden')
  const other = workbook('visible')
  const pending = pendingFailure()
  const execute = vi.fn(() => pending.promise)
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(original, '0')),
    executeSession: execute,
  } as unknown as ComputeAPI
  useEditor.setState({ ...loadWorkbook(original), editingId: null, error: null })
  useEditor.getState().startEdit('root')
  useEditor.getState().setDraft('Edited')
  const hidden = { ...captureDocumentSession(), id: 'tab-hidden' }
  useDocumentTabs.setState({ tabs: [hidden], activeId: 'tab-hidden', recovery: [] })
  useEditor.getState().commitDraft()
  expect(useEditor.getState().editingId).toBeNull()
  expect(useEditor.getState().command({ type: 'toggleCollapse', topicId: 'root' })).toBe(true)
  useEditor.setState({ ...loadWorkbook(other), editingId: null, error: null })
  const visible = { ...captureDocumentSession(), id: 'tab-visible' }
  useDocumentTabs.setState({ tabs: [hidden, visible], activeId: 'tab-visible' })
  pending.reject(new Error('编辑版本已过期'))
  await expect(flushNativeEditor(original.id)).rejects.toThrow('编辑版本已过期')
  const restored = useDocumentTabs.getState().tabs.find((tab) => tab.id === 'tab-hidden')
  expect(restored?.editor.editingId).toBe('root')
  expect(restored?.editor.draft).toBe('Edited')
  expect(restored?.editor.error).toBe('编辑版本已过期')
  expect(execute).toHaveBeenCalledTimes(1)
})

it('marks a queued no-op dirty only until its acknowledgment settles', async () => {
  const book = workbook('focus')
  const pending = pendingSnapshot()
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(book, '0')),
    executeSession: () => pending.promise,
  } as unknown as ComputeAPI
  useEditor.setState({
    ...loadWorkbook(book),
    baseline: serializedWorkbook(book),
    editingId: null,
    error: null,
  })
  expect(editorIsDirty(useEditor.getState())).toBe(false)
  expect(
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: 'Root' }),
  ).toBe(true)
  expect(editorIsDirty(useEditor.getState())).toBe(true)
  pending.resolve(snapshot(book, '0'))
  await flushNativeEditor(book.id)
  expect(editorIsDirty(useEditor.getState())).toBe(false)
})

it('serializes rapid child insertion against the newly focused parent', async () => {
  const book = workbook('focus')
  const pending = pendingSnapshot()
  let authoritative = book
  let revision = 0
  const execute = vi.fn((_id: string, _revision: string, operation: EditorOperation) => {
    if (operation.kind !== 'topic') throw new Error('unexpected operation')
    authoritative = {
      ...authoritative,
      sheets: authoritative.sheets.map((sheet) => ({
        ...sheet,
        document: applyCommand(sheet.document, operation.command),
      })),
    }
    revision += 1
    return revision === 1
      ? pending.promise
      : Promise.resolve(snapshot(authoritative, String(revision)))
  })
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(book, '0')),
    executeSession: execute,
  } as unknown as ComputeAPI
  useEditor.setState({ ...loadWorkbook(book), editingId: null, error: null })
  useEditor.getState().add('child')
  useEditor.getState().add('child')
  await vi.waitFor(() => {
    expect(execute).toHaveBeenCalledTimes(1)
  })
  const first = authoritative.sheets[0]?.document.topics.root?.children[0]
  expect(first).toBeTruthy()
  pending.resolve(snapshot(authoritative, '1'))
  await vi.waitFor(() => {
    expect(execute).toHaveBeenCalledTimes(2)
  })
  await flushNativeEditor(book.id)
  const document = useEditor.getState().history.document
  expect(document.topics.root?.children).toHaveLength(1)
  expect(document.topics[first ?? '']?.children).toHaveLength(1)
  expect(useEditor.getState().editingId).toBe(document.topics[first ?? '']?.children[0])
})

it('preserves a rejected draft before opening another existing topic editor', async () => {
  const book = withTopic(workbook('focus'))
  const pending = pendingFailure()
  const execute = vi.fn(() => pending.promise)
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(book, '0')),
    executeSession: execute,
  } as unknown as ComputeAPI
  useEditor.setState({ ...loadWorkbook(book), editingId: null, error: null })
  useEditor.getState().startEdit('root')
  useEditor.getState().setDraft('Important draft')
  useEditor.getState().startEdit('new')
  expect(useEditor.getState().editingId).toBeNull()
  await vi.waitFor(() => {
    expect(execute).toHaveBeenCalledTimes(1)
  })
  pending.reject(new Error('temporary save failure'))
  await expect(flushNativeEditor(book.id)).rejects.toThrow('temporary save failure')
  expect(useEditor.getState().editingId).toBe('root')
  expect(useEditor.getState().selectedId).toBe('root')
  expect(useEditor.getState().draft).toBe('Important draft')
})
