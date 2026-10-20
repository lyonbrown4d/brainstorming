import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@core'
import type {
  ContentIndexSync,
  ContentIndexWorkbook,
  ContentSearchResult,
} from '@shared/contentSearch'
import { desktop } from '@tests/fixtures/desktop'
import { useEditor } from '@renderer/state/editor'
import { openDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import {
  queryContentIndex,
  queryDocumentMatches,
  startContentIndexSync,
} from '@renderer/state/contentIndex'
import type { SearchMatch } from '@core'
import type { ComputeAPI } from '@shared/compute'
import { loadWorkbook } from '@renderer/state/workbookState'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
let stop: (() => void) | undefined
beforeEach(() => {
  vi.useFakeTimers()
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
})
afterEach(async () => {
  stop?.()
  stop = undefined
  await Promise.resolve()
  vi.useRealTimers()
})
const rename = (title: string): void => {
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title })
}

it('serializes native mutations and waits for the latest edit even while an older update is pending', async () => {
  const gate = deferred<undefined>()
  let running = 0
  let peak = 0
  let first = true
  let indexed: readonly ContentIndexWorkbook[] = []
  const synchronize = vi.fn(async (input: ContentIndexSync) => {
    running += 1
    peak = Math.max(peak, running)
    if (first) {
      first = false
      await gate.promise
    }
    indexed = input.upserts.length ? input.upserts : indexed
    running -= 1
  })
  const search = vi.fn(() => Promise.resolve([]))
  desktop({ syncContentIndex: synchronize, searchContent: search })
  openDocumentTab(createDocument('Original', 'original'))
  stop = startContentIndexSync()
  await Promise.resolve()
  rename('Intermediate')
  const query = queryContentIndex('Latest')
  rename('Latest')
  await vi.advanceTimersByTimeAsync(200)
  expect(search).not.toHaveBeenCalled()
  gate.resolve(undefined)
  await query
  expect(peak).toBe(1)
  expect(indexed[0]?.topics[0]?.title).toBe('Latest')
  expect(search).toHaveBeenCalledOnce()
})

it('requeries after edits during a native search and rejects cancelled results', async () => {
  const gate = deferred<readonly ContentSearchResult[]>()
  const search = vi.fn((): Promise<readonly ContentSearchResult[]> => Promise.resolve([]))
  search.mockImplementationOnce(() => gate.promise)
  desktop({ searchContent: search })
  openDocumentTab(createDocument('Original', 'original'))
  stop = startContentIndexSync()
  const query = queryContentIndex('content')
  await vi.advanceTimersByTimeAsync(0)
  rename('Changed during query')
  gate.resolve([])
  await query
  expect(search).toHaveBeenCalledTimes(2)
  const cancelGate = deferred<readonly ContentSearchResult[]>()
  search.mockImplementationOnce(() => cancelGate.promise)
  const controller = new AbortController()
  const cancelled = queryContentIndex('cancelled', { signal: controller.signal })
  await vi.advanceTimersByTimeAsync(0)
  controller.abort()
  cancelGate.resolve([])
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
})

it('orders an empty cleanup before the next mount instead of letting it erase the new index', async () => {
  const mutations: ContentIndexSync[] = []
  desktop({
    syncContentIndex: (input) => {
      mutations.push(input)
      return Promise.resolve()
    },
  })
  openDocumentTab(createDocument('Document', 'document'))
  stop = startContentIndexSync()
  await queryContentIndex('Document')
  stop()
  stop = startContentIndexSync()
  await queryContentIndex('Document')
  expect(mutations.at(-2)?.retainedWorkbookIds).toEqual([])
  expect(mutations.at(-1)?.retainedWorkbookIds).toEqual([useEditor.getState().workbook.id])
  expect(mutations.at(-1)?.upserts[0]?.topics[0]?.title).toBe('Document')
})

it('waits for index readiness and repeats exact find after a newer edit', async () => {
  const indexGate = deferred<undefined>()
  const findGate = deferred<SearchMatch[]>()
  const find = vi.fn((): Promise<SearchMatch[]> => Promise.resolve([]))
  find.mockImplementationOnce(() => findGate.promise)
  desktop({
    syncContentIndex: () => indexGate.promise,
    compute: { find } as unknown as ComputeAPI,
  })
  openDocumentTab(createDocument('Original', 'original'))
  stop = startContentIndexSync()
  const workbookId = useEditor.getState().workbook.id
  const pending = queryDocumentMatches({ workbookId, query: 'Latest', includeNotes: true })
  await vi.advanceTimersByTimeAsync(0)
  expect(find).not.toHaveBeenCalled()
  indexGate.resolve(undefined)
  await vi.advanceTimersByTimeAsync(0)
  expect(find).toHaveBeenCalledTimes(1)
  // Native acknowledgment replaces the render mirror while exact find is in flight.
  useEditor.setState(loadWorkbook(createDocument('Latest', 'original')))
  findGate.resolve([])
  await vi.advanceTimersByTimeAsync(200)
  await pending
  expect(find).toHaveBeenCalledTimes(2)
  expect(find).toHaveBeenCalledWith({ workbookId, query: 'Latest', includeNotes: true })
})

it('rejects exact find when the index is absent or the request is aborted', async () => {
  await expect(queryDocumentMatches({ workbookId: 'none', query: 'a' })).rejects.toThrow(
    'not initialized',
  )
  const gate = deferred<SearchMatch[]>()
  const find = vi.fn(() => gate.promise)
  desktop({ compute: { find } as unknown as ComputeAPI })
  openDocumentTab(createDocument('Document', 'document'))
  stop = startContentIndexSync()
  const controller = new AbortController()
  const pending = queryDocumentMatches(
    { workbookId: useEditor.getState().workbook.id, query: 'Document' },
    controller.signal,
  )
  await vi.advanceTimersByTimeAsync(0)
  controller.abort()
  gate.resolve([])
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})
