import type { BrowserWindow, WebFrameMain } from 'electron'
import { mcpStartSchema, type MCPConnection } from '@shared/mcp'
import type { EmbeddedMCPServer } from '@main/mcp/server'
import type { MCPRendererBridge } from '@main/mcp/bridge'

export class MCPService {
  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly bridge: MCPRendererBridge,
    private readonly server: Pick<EmbeddedMCPServer, 'start' | 'stop' | 'getConnection'>,
  ) {}
  private detach: (() => void) | undefined
  private starting: Promise<MCPConnection> | null = null
  private stopping: Promise<void> | null = null
  private disposal: Promise<void> | undefined
  private detachOwner = (): void => {
    const cleanup = this.detach
    this.detach = undefined
    cleanup?.()
  }
  stop = (): Promise<void> => {
    if (this.stopping) return this.stopping
    this.detachOwner()
    this.bridge.cancel()
    this.stopping = (async () => {
      await this.starting?.catch(() => undefined)
      await this.server.stop()
      const window = this.getWindow()
      if (window && !window.isDestroyed()) window.webContents.send('mcp:connection-changed', null)
    })().finally(() => {
      this.stopping = null
    })
    return this.stopping
  }

  dispose = (): Promise<void> => {
    this.disposal ??= this.stop()
    return this.disposal
  }

  getConnection = (): MCPConnection | null => this.server.getConnection()
  reply = (owner: number, input: unknown): void => {
    this.bridge.reply(owner, input)
  }
  start = async (
    window: BrowserWindow,
    frame: WebFrameMain | null,
    input: unknown,
  ): Promise<MCPConnection> => {
    if (this.disposal) throw new Error('MCP 服务已关闭')
    const grant = mcpStartSchema.parse(input)
    if (this.starting || this.stopping || this.server.getConnection())
      throw new Error('MCP 已启用或正在切换')
    const owner = { unloaded: false }
    const disconnected = (): void => {
      owner.unloaded = true
      void this.stop().catch(() => undefined)
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
    this.detach = () => {
      window.removeListener('closed', disconnected)
      window.webContents.removeListener('render-process-gone', disconnected)
      window.webContents.removeListener('did-start-navigation', navigation)
    }
    try {
      this.starting = this.server.start(grant)
      const connection = await this.starting
      if (owner.unloaded || window.isDestroyed() || frame !== window.webContents.mainFrame) {
        await this.stop()
        throw new Error('Trelyx 窗口已关闭或重新加载')
      }
      window.webContents.send('mcp:connection-changed', connection)
      return connection
    } catch (cause) {
      this.detachOwner()
      throw cause
    } finally {
      this.starting = null
    }
  }
}
