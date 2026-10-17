import { desktop } from '@tests/fixtures/desktop'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateRecentFiles, recentFilesOptions } from '@renderer/hooks/useRecentFiles'

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
const observe = () => {
  const observer = new QueryObserver(client, recentFilesOptions())
  subscriptions.push(observer.subscribe(() => undefined))
  return observer
}

describe('recent-file IPC query', () => {
  it('exposes loading, then resolves the external recent-file list', async () => {
    const files = [{ path: '/planning.brainstorming', name: 'planning.brainstorming' }]
    const getRecentFiles = vi.fn(() => Promise.resolve(files))
    vi.stubGlobal('window', { brainstorming: desktop({ getRecentFiles }) })
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
      .mockResolvedValueOnce([
        { path: '/recovered.brainstorming', name: 'recovered.brainstorming' },
      ])
    vi.stubGlobal('window', { brainstorming: desktop({ getRecentFiles }) })
    const observer = observe()
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isError).toBe(true)
    })
    expect(getRecentFiles).toHaveBeenCalledTimes(1)
    const retry = observer.refetch()
    expect(observer.getCurrentResult().isFetching).toBe(true)
    await retry
    expect(observer.getCurrentResult().isSuccess).toBe(true)
    expect(observer.getCurrentResult().data?.[0]?.name).toBe('recovered.brainstorming')
    expect(getRecentFiles).toHaveBeenCalledTimes(2)
  })

  it('shares concurrent reads and refreshes after open/save invalidation and remount', async () => {
    const getRecentFiles = vi.fn().mockResolvedValue([])
    vi.stubGlobal('window', { brainstorming: desktop({ getRecentFiles }) })
    const first = observe()
    const second = observe()
    await vi.waitFor(() => {
      expect(second.getCurrentResult().isSuccess).toBe(true)
    })
    expect(getRecentFiles).toHaveBeenCalledTimes(1)
    getRecentFiles.mockResolvedValue([
      { path: '/saved.brainstorming', name: 'saved.brainstorming' },
    ])
    await invalidateRecentFiles(client)
    expect(first.getCurrentResult().data?.[0]?.path).toBe('/saved.brainstorming')
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
    vi.stubGlobal('window', { brainstorming: desktop({ getRecentFiles }) })
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

  it('fails without the desktop bridge instead of presenting browser data', async () => {
    const observer = observe()
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isError).toBe(true)
    })
    expect(observer.getCurrentResult().data).toBeUndefined()
    expect(observer.getCurrentResult().error?.message).toContain('Electron')
  })
})
