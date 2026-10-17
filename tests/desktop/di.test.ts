import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { App, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  events: new Map<string, (...args: unknown[]) => unknown>(),
  installMenu: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getLocale: () => 'zh-CN' },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      if (mocks.handlers.has(channel)) throw new Error('Duplicate handler')
      mocks.handlers.set(channel, handler)
    },
    removeHandler: (channel: string) => mocks.handlers.delete(channel),
    on: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.events.set(channel, handler),
    removeListener: (channel: string) => mocks.events.delete(channel),
  },
  safeStorage: {},
  clipboard: {},
}))
vi.mock('@main/menu', () => ({ installMenu: mocks.installMenu }))
import { createApplicationContainer } from '@main/di/container'
import { windowPorts } from '@main/di/lifecycle'
import { DesktopApplication } from '@main/application/application'
import { WindowSession } from '@main/application/session'
import { AIService } from '@main/ai/application'
import { MCPService } from '@main/mcp/application'
import { DocumentFiles } from '@main/files'
import { FileSecuritySession } from '@main/file-security/session'
import { OpenFileRequests } from '@main/openFiles'
import type { StartupWindow } from '@main/startupWindow'
import { createDocument, createWorkbook } from '@core'

let directory: string
const containers: ReturnType<typeof createApplicationContainer>[] = []
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-di-'))
  mocks.handlers.clear()
  mocks.events.clear()
  mocks.installMenu.mockClear()
})
afterEach(async () => {
  for (const container of containers.splice(0)) await container.unbindAllAsync()
  await rm(directory, { recursive: true, force: true })
})
const createContainer = () => {
  const container = createApplicationContainer({
    storageDirectory: directory,
    platform: 'darwin',
    rendererURL: undefined,
  })
  containers.push(container)
  return container
}
const nativeWindow = () =>
  Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), {
      id: 1,
      mainFrame: {},
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    }),
    loadFile: vi.fn(() => Promise.resolve()),
    isDestroyed: () => false,
  })
const configureWindows = (container: ReturnType<typeof createContainer>) => {
  const windows: ReturnType<typeof nativeWindow>[] = []
  const createWindow = vi.fn(() => {
    const window = nativeWindow()
    windows.push(window)
    return window as unknown as BrowserWindow
  })
  container.rebind(windowPorts).toConstantValue({
    createWindow,
    createStartup: () =>
      ({ attach: vi.fn(), dispose: vi.fn(), fail: vi.fn() }) as unknown as StartupWindow,
    installChrome: vi.fn(),
    showMessageBox: vi.fn(),
    showErrorBox: vi.fn(),
    quit: vi.fn(),
  })
  return { createWindow, windows }
}

describe('application dependency modules', () => {
  it('shares file security inside one app while isolating independent application graphs', () => {
    const first = createContainer()
    const second = createContainer()
    const files = first.get(DocumentFiles)
    expect(first.get(DocumentFiles)).toBe(files)
    expect(second.get(DocumentFiles)).not.toBe(files)
    expect(second.get(FileSecuritySession)).not.toBe(first.get(FileSecuritySession))
    expect(second.get(OpenFileRequests)).not.toBe(first.get(OpenFileRequests))
    const workbook = createWorkbook(createDocument('Shared key', 'shared-key'))
    first.get(FileSecuritySession).configure(workbook.id, 'native-password-123')
    expect(files.getFileSecurity(workbook.id)).toEqual({ encrypted: true })
    expect(second.get(DocumentFiles).getFileSecurity(workbook.id)).toEqual({ encrypted: false })
  })

  it('registers IPC once across start, reload and macOS window recreation, then revokes it on disposal', async () => {
    const container = createContainer()
    const { createWindow, windows } = configureWindows(container)
    const application = container.get(DesktopApplication)
    const app = Object.assign(new EventEmitter(), { quit: vi.fn() })
    application.attach(app as unknown as App, async () => {
      await container.unbindAllAsync()
    })
    await Promise.all([application.start(), application.start()])
    expect(createWindow).toHaveBeenCalledTimes(1)
    const channels = mocks.handlers.size
    expect(channels).toBeGreaterThan(20)
    windows[0]?.webContents.emit('did-start-navigation', {}, 'file://renderer', false, true)
    app.emit('activate')
    expect(createWindow).toHaveBeenCalledTimes(1)
    windows[0]?.emit('closed')
    app.emit('activate')
    expect(createWindow).toHaveBeenCalledTimes(2)
    expect(mocks.handlers.size).toBe(channels)
    expect(mocks.events.size).toBe(2)
    const ai = container.get(AIService)
    const mcp = container.get(MCPService)
    const abort = vi.spyOn(ai, 'dispose')
    const stop = vi.spyOn(mcp, 'stop')
    await application.dispose()
    await container.unbindAllAsync()
    expect(abort).toHaveBeenCalled()
    expect(stop).toHaveBeenCalledOnce()
    expect(mocks.handlers.size).toBe(0)
    expect(mocks.events.size).toBe(0)
    expect(app.listenerCount('activate')).toBe(0)
  })

  it('validates native language IPC against sender and frame before changing preferences or menus', async () => {
    const container = createContainer()
    configureWindows(container)
    await container.get(DesktopApplication).start()
    const window = container.get(WindowSession).window
    if (!window) throw new Error('Missing fixture window')
    const event = {
      sender: window.webContents,
      senderFrame: window.webContents.mainFrame,
    } as IpcMainInvokeEvent
    const get = mocks.handlers.get('app:language:get')
    const set = mocks.handlers.get('app:language:set')
    if (!get || !set) throw new Error('Missing language handlers')
    expect(await get(event)).toBe('zh-CN')
    await expect(
      Promise.resolve().then(() => set({ ...event, senderFrame: {} }, 'en')),
    ).rejects.toThrow('不受信任')
    await expect(Promise.resolve().then(() => set({ ...event, sender: {} }, 'en'))).rejects.toThrow(
      '不受信任',
    )
    await expect(Promise.resolve().then(() => set(event, 'invalid'))).rejects.toThrow('Unsupported')
    expect(await get(event)).toBe('zh-CN')
    expect(mocks.installMenu).toHaveBeenCalledTimes(1)
    expect(await set(event, 'en')).toBe('en')
    expect(await get(event)).toBe('en')
    expect(mocks.installMenu).toHaveBeenLastCalledWith(expect.any(Function), 'en')
  })
})
