import { EventEmitter } from 'node:events'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIResult, AISettings } from '@shared/ai'
import type { PrivateAISettings } from '@main/ai/settings'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>(),
  get: vi.fn<() => Promise<AISettings>>(),
  save: vi.fn<(input: unknown) => Promise<AISettings>>(),
  privateSettings: vi.fn<() => Promise<PrivateAISettings>>(),
  generate:
    vi.fn<
      (settings: PrivateAISettings, request: unknown, signal: AbortSignal) => Promise<AIResult>
    >(),
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/unused-ai-test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: () => Buffer.from([1]),
    decryptString: () => 'fixture-key',
  },
  ipcMain: {
    handle: (channel: string, handler: (event: IpcMainInvokeEvent, input?: unknown) => unknown) =>
      mocks.handlers.set(channel, handler),
  },
}))
import { registerAIIPC } from '@main/ai'
import { AIService } from '@main/ai/application'
import { IPCRegistry } from '@main/application/ipcRegistry'
import { ipcMain } from 'electron'

const settings: AISettings = {
  baseURL: 'http://localhost:11434/v1',
  model: 'fixture-model',
  hasKey: false,
  rememberKey: false,
  structuredOutputs: false,
  keyStorage: 'none',
  notice: null,
}
const result: AIResult = {
  tree: { title: '建议', children: [] },
  topicCount: 1,
  inputTokens: null,
  outputTokens: null,
}
const request = { requestId: 'request-one', mode: 'generate', prompt: '计划', context: [] }
const frame = {}
let service: AIService
const windows = new Map<number, EventEmitter & { webContents: EventEmitter }>()
const event = (id = 1): IpcMainInvokeEvent => {
  return { sender: { id }, senderFrame: frame } as unknown as IpcMainInvokeEvent
}
const invoke = (channel: string, owner = event(), input?: unknown): Promise<unknown> => {
  return Promise.resolve().then(() => {
    const handler = mocks.handlers.get(channel)
    if (!handler) throw new Error('Missing AI IPC handler')
    return handler(owner, input)
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  windows.clear()
  mocks.generate.mockReset()
  mocks.get.mockResolvedValue(settings)
  mocks.save.mockResolvedValue(settings)
  mocks.privateSettings.mockResolvedValue({
    baseURL: settings.baseURL,
    model: settings.model,
    apiKey: '',
    structuredOutputs: false,
  })
  for (const id of [1, 2])
    windows.set(id, Object.assign(new EventEmitter(), { webContents: new EventEmitter() }))
  service = new AIService(
    { get: mocks.get, save: mocks.save, privateSettings: mocks.privateSettings },
    mocks.generate,
  )
  registerAIIPC(
    new IPCRegistry(ipcMain),
    (requestEvent) => {
      const window = windows.get(requestEvent.sender.id)
      if (!window || requestEvent.senderFrame !== frame) throw new Error('不受信任的 AI 请求')
      return window as unknown as BrowserWindow
    },
    service,
  )
})
describe('AI IPC trust and request ownership', () => {
  it('acknowledges cancellation only after a configuration-loading request has released its slot', async () => {
    let release: ((value: PrivateAISettings) => void) | undefined
    mocks.privateSettings.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    mocks.generate.mockImplementation((_settings, _request, signal) =>
      signal.aborted ? Promise.reject(new Error('canceled')) : Promise.resolve(result),
    )
    const operation = invoke('ai:generate', event(), request)
    const rejected = expect(operation).rejects.toThrow('canceled')
    await vi.waitFor(() => {
      expect(mocks.privateSettings).toHaveBeenCalledOnce()
    })
    let canceled = false
    const cancellation = invoke('ai:cancel', event(), request.requestId).then(() => {
      canceled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(canceled).toBe(false)
    if (!release) throw new Error('Settings fixture was not requested')
    release({
      baseURL: settings.baseURL,
      model: settings.model,
      apiKey: '',
      structuredOutputs: false,
    })
    await cancellation
    await rejected
    mocks.generate.mockResolvedValue(result)
    expect(await invoke('ai:generate', event(), request)).toEqual(result)
  })
  it.each(['ai:settings:get', 'ai:settings:save', 'ai:generate', 'ai:cancel'])(
    'rejects untrusted sender and child frame for %s',
    async (channel) => {
      await expect(invoke(channel, event(99), request)).rejects.toThrow('不受信任')
      await expect(
        invoke(channel, { ...event(), senderFrame: {} } as IpcMainInvokeEvent, request),
      ).rejects.toThrow('不受信任')
      expect(mocks.get).not.toHaveBeenCalled()
      expect(mocks.save).not.toHaveBeenCalled()
      expect(mocks.generate).not.toHaveBeenCalled()
      expect(mocks.privateSettings).not.toHaveBeenCalled()
    },
  )
  it('exposes only public settings and scopes cancellation to sender plus exact request ID', async () => {
    expect(await invoke('ai:settings:get')).toEqual(settings)
    expect(
      await invoke('ai:settings:save', event(), { ...settings, apiKey: 'fixture-input-key' }),
    ).not.toHaveProperty('apiKey')
    let signal: AbortSignal | undefined
    mocks.generate.mockImplementation((_settings, _request, nextSignal) => {
      signal = nextSignal
      return new Promise((_resolve, reject) => {
        nextSignal.addEventListener(
          'abort',
          () => {
            reject(new Error('canceled'))
          },
          { once: true },
        )
      })
    })
    const pending = invoke('ai:generate', event(), request)
    await vi.waitFor(() => {
      expect(mocks.generate).toHaveBeenCalledOnce()
    })
    await expect(
      invoke('ai:generate', event(), { ...request, requestId: 'other' }),
    ).rejects.toThrow('已有 AI')
    await invoke('ai:cancel', event(2), request.requestId)
    await invoke('ai:cancel', event(), 'other')
    expect(signal?.aborted).toBe(false)
    await invoke('ai:cancel', event(), request.requestId)
    await expect(pending).rejects.toThrow('canceled')
    expect(signal?.aborted).toBe(true)
    expect(windows.get(1)?.listenerCount('closed')).toBe(0)
    mocks.generate.mockResolvedValue(result)
    expect(await invoke('ai:generate', event(), request)).toEqual(result)
  })
  it.each(['reload', 'crash', 'dispose'] as const)(
    'aborts pending work and removes owner listeners on %s',
    async (reason) => {
      let signal: AbortSignal | undefined
      mocks.generate.mockImplementation((_settings, _request, active) => {
        signal = active
        return new Promise((_resolve, reject) => {
          active.addEventListener(
            'abort',
            () => {
              reject(new Error('canceled'))
            },
            { once: true },
          )
        })
      })
      const operation = invoke('ai:generate', event(), request)
      const rejected = expect(operation).rejects.toThrow('canceled')
      await vi.waitFor(() => {
        expect(signal).toBeDefined()
      })
      const window = windows.get(1)
      if (!window) throw new Error('Missing owner')
      if (reason === 'reload')
        window.webContents.emit('did-start-navigation', {}, 'file://renderer', false, true)
      else if (reason === 'crash') window.webContents.emit('render-process-gone')
      else await service.dispose()
      await rejected
      expect(signal?.aborted).toBe(true)
      expect(window.listenerCount('closed')).toBe(0)
      expect(window.webContents.listenerCount('did-start-navigation')).toBe(0)
      expect(window.webContents.listenerCount('render-process-gone')).toBe(0)
      if (reason === 'dispose')
        await expect(invoke('ai:generate', event(), request)).rejects.toThrow('已关闭')
    },
  )
})
