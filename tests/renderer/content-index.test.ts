import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyWorkbookCommand, createDocument, createWorkbook } from '@core'
import type { ContentIndexSync } from '@shared/contentSearch'
import { desktop } from '@tests/fixtures/desktop'
import { useEditor } from '@renderer/state/editor'
import { closeDocumentTab, openDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import { queryContentIndex, startContentIndexSync } from '@renderer/state/contentIndex'

let stop: (() => void) | undefined
const synchronize = vi.fn<(input: ContentIndexSync) => Promise<void>>(() => Promise.resolve())
const search = vi.fn(() => Promise.resolve([]))
const rename = (title: string): void => {
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title })
}
const currentTabId = (): string => {
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Missing tab')
  return id
}

beforeEach(() => {
  vi.useFakeTimers()
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  synchronize.mockReset().mockImplementation(() => Promise.resolve())
  search.mockClear()
  desktop({ syncContentIndex: synchronize, searchContent: search })
  vi.stubGlobal('window', { confirm: () => true })
})
afterEach(async () => {
  stop?.()
  stop = undefined
  await Promise.resolve()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('indexes every open sheet, including notes and live unsaved edits over the stale tab capture', async () => {
  const alpha = applyWorkbookCommand(createWorkbook(createDocument('Alpha', 'alpha')), {
    type: 'addSheet',
    sheet: { id: 'second', name: 'Second sheet', document: createDocument('Hidden sheet') },
  })
  openDocumentTab(alpha)
  useEditor.getState().command({ type: 'setTopicNotes', topicId: 'root', notes: 'Research notes' })
  openDocumentTab(createDocument('Beta', 'beta'))
  stop = startContentIndexSync()
  rename('Live unsaved beta')
  await queryContentIndex('Research notes', { limit: 12 })
  const inputs = synchronize.mock.calls.flatMap(([input]) => input.upserts)
  expect(inputs.find((entry) => entry.workbookId === alpha.id)?.topics).toEqual([
    expect.objectContaining({ sheetId: 'alpha', title: 'Alpha', notes: 'Research notes' }),
    expect.objectContaining({
      sheetId: 'second',
      sheetName: 'Second sheet',
      title: 'Hidden sheet',
    }),
  ])
  expect(inputs.at(-1)?.topics[0]?.title).toBe('Live unsaved beta')
  expect(search).toHaveBeenLastCalledWith({ query: 'Research notes', limit: 12 })
  expect(useEditor.getState().path).toBeNull()
})

it('does not rebuild or synchronize for a selection, viewport, draft, or repeated query', async () => {
  openDocumentTab(createDocument('Original', 'original'))
  stop = startContentIndexSync()
  await queryContentIndex('Original')
  const count = synchronize.mock.calls.length
  useEditor.getState().select('root')
  useEditor.setState({ views: { original: { x: 10, y: 20, zoom: 1 } } })
  useEditor.getState().startEdit('root')
  useEditor.getState().setDraft('Uncommitted composition')
  await queryContentIndex('Original')
  await vi.advanceTimersByTimeAsync(500)
  expect(synchronize).toHaveBeenCalledTimes(count)
  expect(useEditor.getState().draft).toBe('Uncommitted composition')
  useEditor.getState().commitDraft()
  await queryContentIndex('composition')
  expect(synchronize.mock.calls.at(-1)?.[0].upserts[0]?.topics[0]?.title).toBe(
    'Uncommitted composition',
  )
})

it('prunes closed workbooks and flushes an empty retained list on disposal', async () => {
  openDocumentTab(createDocument('First', 'first'))
  const firstId = currentTabId()
  const firstWorkbookId = useEditor.getState().workbook.id
  openDocumentTab(createDocument('Second', 'second'))
  const secondWorkbookId = useEditor.getState().workbook.id
  stop = startContentIndexSync()
  await queryContentIndex('First')
  closeDocumentTab(firstId)
  await queryContentIndex('First')
  expect(synchronize.mock.calls.at(-1)?.[0]).toEqual({
    upserts: [],
    retainedWorkbookIds: [secondWorkbookId],
  })
  expect(synchronize.mock.calls.at(-1)?.[0].retainedWorkbookIds).not.toContain(firstWorkbookId)
  stop()
  stop = undefined
  await Promise.resolve()
  await Promise.resolve()
  expect(synchronize).toHaveBeenLastCalledWith({ upserts: [], retainedWorkbookIds: [] })
  await expect(queryContentIndex('First')).rejects.toThrow('not initialized')
})

it('surfaces a failed native update and retries every unsynchronized workbook on the next change', async () => {
  synchronize.mockRejectedValueOnce(new Error('Index capacity exceeded'))
  openDocumentTab(createDocument('Before', 'before'))
  stop = startContentIndexSync()
  await expect(queryContentIndex('Before')).rejects.toThrow('Index capacity exceeded')
  expect(search).not.toHaveBeenCalled()
  await queryContentIndex('Before')
  expect(synchronize.mock.calls.at(-1)?.[0].upserts[0]?.topics[0]?.title).toBe('Before')
  rename('After recovery')
  await queryContentIndex('After')
  expect(synchronize.mock.calls.at(-1)?.[0].upserts[0]?.topics[0]?.title).toBe('After recovery')
  expect(search).toHaveBeenLastCalledWith({ query: 'After' })
})
