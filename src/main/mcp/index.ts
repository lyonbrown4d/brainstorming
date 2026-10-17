import {
  app,
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron'
import { mcpStartSchema, type MCPConnection } from '@shared/mcp'
import { EmbeddedMCPServer } from '@main/mcp/server'
import { MCPRendererBridge } from '@main/mcp/bridge'

export const registerMCPIPC = (
  getWindow: () => BrowserWindow | null,
  trusted: (event: IpcMainInvokeEvent | IpcMainEvent) => BrowserWindow,
): void => {
  const bridge: MCPRendererBridge = new MCPRendererBridge(getWindow, () => server.getConnection())
  const server: EmbeddedMCPServer = new EmbeddedMCPServer(bridge.request)
  let detach: (() => void) | undefined
  let starting: Promise<MCPConnection> | null = null
  let stopping: Promise<void> | null = null
  const detachOwner = (): void => {
    const cleanup = detach
    detach = undefined
    cleanup?.()
  }
  const stop = (): Promise<void> => {
    if (stopping) return stopping
    detachOwner()
    bridge.cancel()
    stopping = (async () => {
      await starting?.catch(() => undefined)
      await server.stop()
      const window = getWindow()
      if (window && !window.isDestroyed()) window.webContents.send('mcp:connection-changed', null)
    })().finally(() => {
      stopping = null
    })
    return stopping
  }
  ipcMain.handle('mcp:connection', (event) => {
    trusted(event)
    return server.getConnection()
  })
  ipcMain.handle('mcp:start', async (event, input: unknown) => {
    const window = trusted(event)
    const grant = mcpStartSchema.parse(input)
    if (starting || stopping || server.getConnection()) throw new Error('MCP 已启用或正在切换')
    const owner = { unloaded: false }
    const disconnected = (): void => {
      owner.unloaded = true
      void stop().catch(() => undefined)
    }
    const navigation = (
      _event: unknown,
      _url: string,
      _inPlace: boolean,
      isMainFrame: boolean,
    ): void => {
      if (isMainFrame) disconnected()
    }
    window.once('closed', disconnected)
    window.webContents.once('render-process-gone', disconnected)
    window.webContents.on('did-start-navigation', navigation)
    detach = () => {
      window.removeListener('closed', disconnected)
      window.webContents.removeListener('render-process-gone', disconnected)
      window.webContents.removeListener('did-start-navigation', navigation)
    }
    try {
      starting = server.start(grant)
      const connection = await starting
      if (
        owner.unloaded ||
        window.isDestroyed() ||
        event.senderFrame !== window.webContents.mainFrame
      ) {
        await stop()
        throw new Error('Trelyx 窗口已关闭或重新加载')
      }
      window.webContents.send('mcp:connection-changed', connection)
      return connection
    } catch (cause) {
      detachOwner()
      throw cause
    } finally {
      starting = null
    }
  })
  ipcMain.handle('mcp:stop', (event) => {
    trusted(event)
    return stop()
  })
  ipcMain.on('mcp:reply', (event, input: unknown) => {
    try {
      trusted(event)
      bridge.reply(event.sender.id, input)
    } catch {
      /* Ignore untrusted notifications. */
    }
  })
  app.on('before-quit', () => {
    void stop().catch(() => undefined)
  })
}
