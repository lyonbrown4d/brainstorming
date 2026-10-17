import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, deserializeWorkbook } from '@core'
import type { SaveRequest } from '@shared/contracts'
import { desktop } from '@tests/fixtures/desktop'
import { isDirty, useEditor } from '@renderer/state/editor'
import { openDocumentTab, closeDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { workspaceRecoveryContents } from '@renderer/state/documentRecovery'
import { startDocumentAutosave } from '@renderer/state/documentAutosave'
import { useWorkspace } from '@renderer/state/workspace'

let stop: (() => void) | undefined
const confirmDiscard = vi.fn(() => true)
const persist = vi.fn((request: SaveRequest) => Promise.resolve(request.path))
const rename = (title: string): void => {
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title })
}
const savedTitle = (index: number): string | undefined => {
  const request = persist.mock.calls[index]?.[0]
  return request ? deserializeWorkbook(request.contents).sheets[0]?.document.title : undefined
}
beforeEach(() => {
  vi.useFakeTimers()
  persist.mockReset().mockImplementation((request) => Promise.resolve(request.path))
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  confirmDiscard.mockReset().mockReturnValue(true)
  vi.stubGlobal('window', { confirm: confirmDiscard })
  desktop({ saveDocument: persist })
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('keeps unnamed edits in memory and asks before discarding them', async () => {
  openDocumentTab(createDocument('Untitled', 'unnamed'))
  stop = startDocumentAutosave()
  rename('Only in memory')
  await vi.advanceTimersByTimeAsync(5000)
  expect(persist).not.toHaveBeenCalled()
  expect(workspaceRecoveryContents()).toEqual([])
  expect(isDirty()).toBe(true)
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Missing tab')
  confirmDiscard.mockReturnValueOnce(false)
  expect(closeDocumentTab(id)).toBe(false)
  expect(useEditor.getState().history.document.title).toBe('Only in memory')
  expect(closeDocumentTab(id)).toBe(true)
  expect(useDocumentTabs.getState().tabs).toEqual([])
  expect(useWorkspace.getState().hasDocument).toBe(false)
})

it('coalesces named edits, persists their contents and clears only their saved baseline', async () => {
  openDocumentTab(createDocument('Named', 'named'), '/named.brainstorming')
  stop = startDocumentAutosave()
  rename('First')
  await vi.advanceTimersByTimeAsync(500)
  rename('Latest')
  await vi.advanceTimersByTimeAsync(699)
  expect(persist).not.toHaveBeenCalled()
  expect(isDirty()).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  expect(persist).toHaveBeenCalledTimes(1)
  expect(persist.mock.calls[0]?.[0].path).toBe('/named.brainstorming')
  expect(savedTitle(0)).toBe('Latest')
  expect(isDirty()).toBe(false)
})

it('projects a live draft without committing history or changing the editor session', async () => {
  openDocumentTab(createDocument('Original', 'named'), '/named.brainstorming')
  stop = startDocumentAutosave()
  useEditor.getState().startEdit('root', undefined, 'rich-title', 'end')
  useEditor.getState().setRichDraft('**正在组词**', '正在组词')
  const before = useEditor.getState()
  const commit = vi.spyOn(before, 'commitDraft')
  await vi.advanceTimersByTimeAsync(700)
  const current = useEditor.getState()
  expect(savedTitle(0)).toBe('正在组词')
  const request = persist.mock.calls[0]?.[0]
  expect(
    request && deserializeWorkbook(request.contents).sheets[0]?.document.topics.root?.metadata,
  ).toEqual({ richTitle: '**正在组词**' })
  expect(commit).not.toHaveBeenCalled()
  expect(current.history).toBe(before.history)
  expect(current.workbook).toBe(before.workbook)
  expect(current.editingId).toBe('root')
  expect(current.editingSurface).toBe('rich-title')
  expect(current.editSelection).toBe('end')
  expect(current.draft).toBe('正在组词')
  expect(current.richDraft).toBe('**正在组词**')
  expect(current.busy).toBe(false)
  expect(isDirty()).toBe(false)
  commit.mockRestore()
})

it('writes the actual committed contents again after cancelling an autosaved draft', async () => {
  openDocumentTab(createDocument('Original', 'named'), '/named.brainstorming')
  stop = startDocumentAutosave()
  useEditor.getState().startEdit('root')
  useEditor.getState().setDraft('Temporary draft')
  await vi.advanceTimersByTimeAsync(700)
  expect(savedTitle(0)).toBe('Temporary draft')
  useEditor.getState().cancelEdit()
  expect(isDirty()).toBe(true)
  await vi.advanceTimersByTimeAsync(700)
  expect(savedTitle(1)).toBe('Original')
  expect(isDirty()).toBe(false)
})

it('keeps failures dirty, exposes the error and retries the same contents without input', async () => {
  persist.mockRejectedValueOnce(new Error('Disk full'))
  openDocumentTab(createDocument('Original', 'named'), '/named.brainstorming')
  stop = startDocumentAutosave()
  rename('Needs retry')
  await vi.advanceTimersByTimeAsync(700)
  expect(useEditor.getState().error).toBe('Disk full')
  expect(isDirty()).toBe(true)
  await vi.advanceTimersByTimeAsync(3700)
  expect(savedTitle(1)).toBe('Needs retry')
  expect(isDirty()).toBe(false)
  expect(useEditor.getState().error).toBeNull()
})

it('preserves invalid input and dirty state instead of writing an invalid snapshot', async () => {
  openDocumentTab(createDocument('Original', 'named'), '/named.brainstorming')
  stop = startDocumentAutosave()
  useEditor.getState().startEdit('root', undefined, 'notes')
  const invalid = 'a'.repeat(100_001)
  useEditor.getState().setDraft(invalid)
  await vi.advanceTimersByTimeAsync(700)
  expect(persist).not.toHaveBeenCalled()
  expect(useEditor.getState().draft).toBe(invalid)
  expect(useEditor.getState().editingId).toBe('root')
  expect(isDirty()).toBe(true)
  expect(useEditor.getState().error).toContain('100000')
})
