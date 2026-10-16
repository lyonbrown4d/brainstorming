import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  invalidateRecentFiles,
  recentFilesOptions,
} from '../../src/renderer/src/hooks/useRecentFiles'

let client: QueryClient
let subscriptions: (() => void)[]
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  subscriptions = []
  vi.stubGlobal('window', {})
})
afterEach(() => {
  for (const unsubscribe of subscriptions) unsubscribe()
  client.clear()
  vi.unstubAllGlobals()
})
function observe() {
  const observer = new QueryObserver(client, recentFilesOptions())
  subscriptions.push(observer.subscribe(() => undefined))
  return observer
}

describe('recent-file IPC query', () => {
  it('exposes loading, then resolves the external recent-file list', async () => {
    const files = [{ path: '/planning.trelyx', name: 'planning.trelyx' }]
    const getRecentFiles = vi.fn(() => Promise.resolve(files))
    vi.stubGlobal('window', { trelyx: { getRecentFiles } })
    const observer = observe()
    expect(observer.getCurrentResult().isPending).toBe(true)
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isSuccess).toBe(true)
    })
    expect(observer.getCurrentResult().data).toEqual(files)
    expect(getRecentFiles).toHaveBeenCalledTimes(1)
  })

  it('reports the first failure without automatic retries and supports an explicit retry', async () => {
    const getRecentFiles = vi
      .fn()
      .mockRejectedValueOnce(new Error('IPC unavailable'))
      .mockResolvedValueOnce([{ path: '/recovered.trelyx', name: 'recovered.trelyx' }])
    vi.stubGlobal('window', { trelyx: { getRecentFiles } })
    const observer = observe()
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isError).toBe(true)
    })
    expect(getRecentFiles).toHaveBeenCalledTimes(1)
    const retry = observer.refetch()
    expect(observer.getCurrentResult().isFetching).toBe(true)
    await retry
    expect(observer.getCurrentResult().isSuccess).toBe(true)
    expect(observer.getCurrentResult().data?.[0]?.name).toBe('recovered.trelyx')
    expect(getRecentFiles).toHaveBeenCalledTimes(2)
  })

  it('shares concurrent reads and refreshes after open/save invalidation and remount', async () => {
    const getRecentFiles = vi.fn().mockResolvedValue([])
    vi.stubGlobal('window', { trelyx: { getRecentFiles } })
    const first = observe()
    const second = observe()
    await vi.waitFor(() => {
      expect(second.getCurrentResult().isSuccess).toBe(true)
    })
    expect(getRecentFiles).toHaveBeenCalledTimes(1)
    getRecentFiles.mockResolvedValue([{ path: '/saved.trelyx', name: 'saved.trelyx' }])
    await invalidateRecentFiles(client)
    expect(first.getCurrentResult().data?.[0]?.path).toBe('/saved.trelyx')
    expect(getRecentFiles).toHaveBeenCalledTimes(2)
    for (const unsubscribe of subscriptions) unsubscribe()
    subscriptions = []
    observe()
    await vi.waitFor(() => {
      expect(getRecentFiles).toHaveBeenCalledTimes(3)
    })
  })

  it('defers the menu read until opened and reloads when reopened', async () => {
    const getRecentFiles = vi.fn().mockResolvedValue([])
    vi.stubGlobal('window', { trelyx: { getRecentFiles } })
    const options = recentFilesOptions()
    const observer = new QueryObserver(client, { ...options, enabled: false })
    subscriptions.push(observer.subscribe(() => undefined))
    expect(getRecentFiles).not.toHaveBeenCalled()
    observer.setOptions({ ...options, enabled: true })
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isSuccess).toBe(true)
    })
    observer.setOptions({ ...options, enabled: false })
    observer.setOptions({ ...options, enabled: true })
    await vi.waitFor(() => {
      expect(getRecentFiles).toHaveBeenCalledTimes(2)
    })
  })

  it('returns an empty list in the browser without sharing desktop cached paths', async () => {
    client.setQueryData(['recent-files', 'desktop'], [{ path: '/private.trelyx', name: 'private' }])
    const observer = observe()
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isSuccess).toBe(true)
    })
    expect(observer.getCurrentResult().data).toEqual([])
  })
})
