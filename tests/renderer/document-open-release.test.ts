import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { importDroppedFiles } from '@renderer/hooks/useFileDrop'
import { queueDocumentWrite } from '@renderer/lib/documentWriteQueue'
import { openDocument } from '@renderer/state/files'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { resetFileSecurityState } from '@renderer/state/password'
import { useWorkspace } from '@renderer/state/workspace'
import { desktop } from '@tests/fixtures/desktop'

const deferred = () => {
  let resolve = (): void => undefined
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
const path = '/reopened.brainstorming'
const contents = serializeWorkbook(createWorkbook(createDocument('Reopened', 'reopened')))

beforeEach(() => {
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  resetFileSecurityState()
  vi.stubGlobal('window', { confirm: vi.fn(() => true) })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

it.each([
  { name: 'the file picker', start: () => openDocument() },
  { name: 'a recent file', start: () => openDocument(path) },
  { name: 'a pending system file', start: () => openDocument(undefined, true) },
  { name: 'a native path drop', start: () => importDroppedFiles([path], null) },
  { name: 'a raw file drop', start: () => importDroppedFiles([], null) },
])('waits for the old write and release before reopening through $name', async ({ start }) => {
  const writeGate = deferred()
  const releaseGate = deferred()
  const activationGate = deferred()
  const sources = new Set([path])
  const nativeOpen = vi.fn(() => {
    sources.add(path)
    return Promise.resolve({ path, contents })
  })
  const dropped = async () => ({ documents: [await nativeOpen()], assets: [] })
  desktop({
    openDocument: nativeOpen,
    openRecent: nativeOpen,
    hasOpenFile: () => Promise.resolve(true),
    takeOpenFile: nativeOpen,
    importDroppedPaths: dropped,
    importDroppedFiles: dropped,
    setFilePassword: async () => {
      await activationGate.promise
      return { encrypted: false }
    },
  })
  const writing = queueDocumentWrite(path, () => writeGate.promise)
  let releaseStarted = false
  const releasing = queueDocumentWrite(path, async () => {
    releaseStarted = true
    await releaseGate.promise
    if (!useDocumentTabs.getState().tabs.some((tab) => tab.editor.path === path))
      sources.delete(path)
  })
  const opening = start()
  try {
    await Promise.resolve()
    expect(useEditor.getState().busy).toBe(true)
    expect(nativeOpen).not.toHaveBeenCalled()
    expect(useDocumentTabs.getState().tabs).toEqual([])
    writeGate.resolve()
    await writing
    await vi.waitFor(() => {
      expect(releaseStarted).toBe(true)
    })
    expect(nativeOpen).not.toHaveBeenCalled()
    releaseGate.resolve()
    await releasing
    await vi.waitFor(() => {
      expect(nativeOpen).toHaveBeenCalledOnce()
    })
    activationGate.resolve()
    await opening
    expect(sources.has(path)).toBe(true)
    expect(useEditor.getState().path).toBe(path)
    expect(useEditor.getState().workbook.title).toBe('Reopened')
    expect(useDocumentTabs.getState().tabs).toHaveLength(1)
    expect(useEditor.getState().busy).toBe(false)
  } finally {
    writeGate.resolve()
    releaseGate.resolve()
    activationGate.resolve()
    await Promise.allSettled([writing, releasing, opening])
  }
})
