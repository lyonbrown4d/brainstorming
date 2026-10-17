import { EventEmitter } from 'node:events'
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MCPConnection, MCPStart } from '@shared/mcp'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>(),
  notifications: new Map<string, (event: IpcMainEvent, input: unknown) => void>(),
  appEvents: new Map<string, () => void>(),
  start: vi.fn<(input: MCPStart) => Promise<MCPConnection>>(),
  stop: vi.fn<() => Promise<void>>(),
  getConnection: vi.fn<() => MCPConnection | null>(),
}))
vi.mock('electron', () => ({
  app: { on: (name: string, callback: () => void) => mocks.appEvents.set(name, callback) },
  ipcMain: {
    handle: (name: string, handler: (event: IpcMainInvokeEvent, input?: unknown) => unknown) =>
      mocks.handlers.set(name, handler),
    on: (name: string, handler: (event: IpcMainEvent, input: unknown) => void) =>
      mocks.notifications.set(name, handler),
  },
}))
import { registerMCPIPC } from '@main/mcp'
import { MCPService } from '@main/mcp/application'
import { MCPRendererBridge } from '@main/mcp/bridge'
import { IPCRegistry } from '@main/application/ipcRegistry'
import { ipcMain } from 'electron'

const grant: MCPStart = { workbookId: 'workbook', includeNotes: false, allowProposals: false }
const connection: MCPConnection = {
  ...grant,
  endpoint: 'http://127.0.0.1:1234/mcp',
  token: 'fixture-secret',
  sessionId: 'fixture-session',
}
const setup = () => {
  const contents = Object.assign(new EventEmitter(), { id: 1, mainFrame: {}, send: vi.fn() })
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
  })
  const typedWindow = window as unknown as BrowserWindow
  registerMCPIPC(
    new IPCRegistry(ipcMain),
    (event) => {
      if (
        event.sender !== typedWindow.webContents ||
        event.senderFrame !== typedWindow.webContents.mainFrame
      )
        throw new Error('不受信任的请求')
      return window as unknown as BrowserWindow
    },
    new MCPService(
      () => typedWindow,
      new MCPRendererBridge(() => typedWindow, mocks.getConnection),
      { start: mocks.start, stop: mocks.stop, getConnection: mocks.getConnection },
    ),
  )
  const event = {
    sender: contents,
    senderFrame: contents.mainFrame,
  } as unknown as IpcMainInvokeEvent
  const invoke = async (channel: string, input?: unknown, owner = event): Promise<unknown> => {
    const handler = mocks.handlers.get(channel)
    if (!handler) throw new Error('Missing MCP handler')
    return await handler(owner, input)
  }
  return { window, contents, event, invoke }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.start.mockResolvedValue(connection)
  mocks.stop.mockResolvedValue()
  mocks.getConnection.mockReturnValue(null)
})
describe('embedded MCP IPC lifecycle and trust boundary', () => {
  it('stops a pending startup if the renderer reloads before the port is ready', async () => {
    let ready: ((value: MCPConnection) => void) | undefined
    mocks.start.mockReturnValue(
      new Promise((resolve) => {
        ready = resolve
      }),
    )
    const { invoke, contents } = setup()
    const operation = invoke('mcp:start', grant)
    const rejected = expect(operation).rejects.toThrow('重新加载')
    contents.emit('did-start-navigation', {}, 'file://renderer', false, true)
    if (!ready) throw new Error('Startup fixture is missing')
    ready(connection)
    await rejected
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(contents.send).not.toHaveBeenCalledWith('mcp:connection-changed', connection)
  })
  it.each(['mcp:connection', 'mcp:start', 'mcp:stop'])(
    'rejects foreign windows and child frames for %s',
    async (channel) => {
      const { invoke, event } = setup()
      await expect(
        invoke(channel, grant, { ...event, sender: {} } as IpcMainInvokeEvent),
      ).rejects.toThrow('不受信任')
      await expect(
        invoke(channel, grant, { ...event, senderFrame: {} } as IpcMainInvokeEvent),
      ).rejects.toThrow('不受信任')
      expect(mocks.start).not.toHaveBeenCalled()
      expect(mocks.stop).not.toHaveBeenCalled()
    },
  )
  it('starts only explicitly, validates the grant and tears down sharing on renderer reload', async () => {
    const { invoke, contents } = setup()
    expect(await invoke('mcp:connection')).toBeNull()
    expect(mocks.start).not.toHaveBeenCalled()
    await expect(invoke('mcp:start', { ...grant, path: '/private' })).rejects.toThrow()
    expect(await invoke('mcp:start', grant)).toEqual(connection)
    expect(contents.send).toHaveBeenCalledWith('mcp:connection-changed', connection)
    contents.emit('did-start-navigation', {}, 'file://renderer', false, true)
    await vi.waitFor(() => {
      expect(mocks.stop).toHaveBeenCalledOnce()
    })
    expect(contents.listenerCount('did-start-navigation')).toBe(0)
  })
})
