import { fixtureCatalog, fixtureTemplate } from '@tests/fixtures/templates'
import { describe, expect, it, vi } from 'vitest'
import { createNativeAPI, type NativeInitialization } from '@renderer/lib/nativeAPI'
import type { NativeDrop, NativeTransport } from '@renderer/lib/nativeTransport'
import { createDocument, createWorkbook, deserializeWorkbook, serializeWorkbook } from '@core'

const initial: NativeInitialization = {
  platform: 'macos',
  resourceOrigin: 'http://127.0.0.1:43123/',
  language: 'en',
  windowState: { focused: true, fullScreen: false },
}
const fixture = () => {
  const events = new Map<string, (payload: unknown) => void>()
  const calls: { method: string; args: Record<string, unknown> }[] = []
  let drop: ((payload: NativeDrop | null) => void) | undefined
  let result: unknown = null
  const transport: NativeTransport = {
    request: <T>(method: string, args: Record<string, unknown> = {}): Promise<T> => {
      calls.push({ method, args })
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result as T)
    },
    listen: (event, callback) => {
      events.set(event, callback)
      return Promise.resolve(() => {
        events.delete(event)
      })
    },
    onDrop: (callback) => {
      drop = callback
      return Promise.resolve(() => {
        drop = undefined
      })
    },
  }
  return {
    transport,
    events,
    calls,
    emitDrop: (next: NativeDrop | null) => drop?.(next),
    setResult: (next: unknown) => {
      result = next
    },
  }
}

describe('Tauri platform adapter', () => {
  it('exposes settings-only notification operations without requesting on initialization', async () => {
    const native = fixture()
    const { api, dispose } = await createNativeAPI(native.transport, initial)
    expect(native.calls).toEqual([])
    native.setResult({ enabled: false, permission: 'denied' })
    await expect(api.getNotificationSettings()).resolves.toEqual({
      enabled: false,
      permission: 'denied',
    })
    expect(native.calls.at(-1)).toEqual({ method: 'getNotificationSettings', args: {} })
    await api.setNotificationsEnabled(true)
    expect(native.calls.at(-1)).toEqual({
      method: 'setNotificationsEnabled',
      args: { enabled: true },
    })
    dispose()
  })
  it('requests bundled templates through an ID-only boundary and validates replies', async () => {
    const native = fixture()
    const { api, dispose } = await createNativeAPI(native.transport, initial)
    native.setResult(fixtureCatalog)
    await expect(api.listTemplates()).resolves.toEqual(fixtureCatalog)
    expect(native.calls.at(-1)).toEqual({ method: 'listTemplates', args: {} })
    native.setResult(fixtureTemplate('brainstorm'))
    await expect(api.getTemplate('brainstorm')).resolves.toMatchObject({ id: 'brainstorm' })
    expect(native.calls.at(-1)).toEqual({ method: 'getTemplate', args: { id: 'brainstorm' } })
    const previousCalls = native.calls.length
    await expect(api.getTemplate('../secrets')).rejects.toThrow()
    await expect(api.getTemplate('blank')).rejects.toThrow()
    expect(native.calls).toHaveLength(previousCalls)
    native.setResult({ id: 'brainstorm', topics: [] })
    await expect(api.getTemplate('brainstorm')).rejects.toThrow()
    dispose()
  })
  it('forwards system appearance unchanged and keeps manual modes explicit', async () => {
    const native = fixture()
    const { api, dispose } = await createNativeAPI(native.transport, initial)
    for (const theme of ['system', 'light', 'dark'] as const) {
      await api.setAppearance(theme)
      expect(native.calls.at(-1)).toEqual({ method: 'setAppearance', args: { theme } })
    }
    dispose()
  })
  it('routes file operations with named arguments and serializes export bytes', async () => {
    const native = fixture()
    const { api, dispose } = await createNativeAPI(native.transport, initial)
    native.setResult('/maps/export.pdf')
    expect(
      await api.exportFile({ format: 'pdf', suggestedName: 'map.pdf', bytes: Uint8Array.of(1, 2) }),
    ).toBe('/maps/export.pdf')
    expect(native.calls.at(-1)).toEqual({
      method: 'exportFile',
      args: { request: { format: 'pdf', suggestedName: 'map.pdf', bytes: [1, 2] } },
    })
    native.setResult({ documents: [], assets: [] })
    await api.importDroppedPaths?.(['/maps/large.brainstorming'])
    expect(native.calls.at(-1)).toEqual({
      method: 'importDroppedFiles',
      args: { paths: ['/maps/large.brainstorming'] },
    })
    expect(api.resourceOrigin).toBe('http://127.0.0.1:43123')
    dispose()
    expect(native.events.size).toBe(0)
  })
  it('forwards typed content indexing and querying through the native input envelope', async () => {
    const native = fixture()
    const { api, dispose } = await createNativeAPI(native.transport, initial)
    const input = { upserts: [], retainedWorkbookIds: ['open-workbook'] }
    await api.syncContentIndex(input)
    expect(native.calls.at(-1)).toEqual({ method: 'syncContentIndex', args: { input } })
    native.setResult([])
    await expect(api.searchContent({ query: '备注', limit: 12 })).resolves.toEqual([])
    expect(native.calls.at(-1)).toEqual({
      method: 'searchContent',
      args: { input: { query: '备注', limit: 12 } },
    })
    dispose()
  })
  it('validates events and stops delivering after unsubscription', async () => {
    const native = fixture()
    const { api } = await createNativeAPI(native.transport, initial)
    const callback = vi.fn()
    const unsubscribe = api.onMenuAction(callback)
    native.events.get('native:menu-action')?.({ action: 'save', windowId: null })
    native.events.get('native:menu-action')?.('unsafe-command')
    unsubscribe()
    native.events.get('native:menu-action')?.({ action: 'open', windowId: null })
    expect(callback.mock.calls).toEqual([['save', undefined]])
    const state = vi.fn()
    api.onWindowStateChanged(state)
    native.events.get('native:window-state')?.({ focused: 'yes', fullScreen: false })
    native.events.get('native:window-state')?.({ focused: false, fullScreen: true })
    expect(state.mock.calls).toEqual([[{ focused: false, fullScreen: true }]])
    const dropped = vi.fn()
    api.onNativeFileDrop?.(dropped)
    native.emitDrop({ paths: ['/maps/map.brainstorming'], x: 20, y: 50 })
    native.emitDrop(null)
    expect(dropped.mock.calls).toEqual([[{ paths: ['/maps/map.brainstorming'], x: 20, y: 50 }]])
  })
  it('receives a native-converted XMind document and keeps import warnings', async () => {
    const native = fixture()
    const { api } = await createNativeAPI(native.transport, initial)
    const contents = serializeWorkbook(
      createWorkbook(createDocument('Imported root', 'source-map')),
    )
    native.setResult({
      path: null,
      sourcePath: '/maps/source.xmind',
      contents,
      warnings: ['未导入 XMind 主题配色（1 项）'],
    })
    const opened = await api.openDocument()
    expect(opened?.path).toBeNull()
    expect(opened?.sourcePath).toBe('/maps/source.xmind')
    expect(opened?.warnings).toEqual(['未导入 XMind 主题配色（1 项）'])
    expect(deserializeWorkbook(opened?.contents ?? '').sheets[0]?.document.title).toBe(
      'Imported root',
    )
    native.setResult(new Error('ZIP 文件损坏'))
    await expect(api.openDocument()).rejects.toThrow('ZIP 文件损坏')
  })
  it('cleans up earlier listeners when a required native subscription fails', async () => {
    const native = fixture()
    const listen = native.transport.listen.bind(native.transport)
    native.transport.listen = (event, callback) =>
      event === 'native:window-state'
        ? Promise.reject(new Error('event transport failed'))
        : listen(event, callback)
    await expect(createNativeAPI(native.transport, initial)).rejects.toThrow(
      'event transport failed',
    )
    expect(native.events.size).toBe(0)
  })
  it('does not register desktop drag-and-drop on mobile', async () => {
    const native = fixture()
    const onDrop = vi.spyOn(native.transport, 'onDrop')
    const { api } = await createNativeAPI(native.transport, { ...initial, platform: 'ios' })
    expect(api.platform).toBe('ios')
    expect(onDrop).not.toHaveBeenCalled()
  })
})
