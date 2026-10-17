import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { MCP_LIMITS, type MCPAction, type MCPBridgeReply, type MCPConnection } from '@shared/mcp'

export class MCPRendererBridge {
  private pending = new Map<
    string,
    {
      owner: number
      resolve: (value: Record<string, unknown>) => void
      reject: (error: Error) => void
    }
  >()
  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly getConnection: () => MCPConnection | null,
  ) {}

  request = async (action: MCPAction, signal: AbortSignal): Promise<Record<string, unknown>> => {
    const window = this.getWindow()
    const connection = this.getConnection()
    if (!window || window.isDestroyed() || !connection) throw new Error('Brainstorming 共享已停止')
    if (this.pending.size >= 4) throw new Error('Brainstorming 请求繁忙，请稍后重试')
    signal.throwIfAborted()
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const finish = (data?: Record<string, unknown>, error?: Error): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        this.pending.delete(id)
        if (error) reject(error)
        else resolve(data ?? {})
      }
      const abort = (): void => {
        finish(undefined, new Error('Brainstorming 请求已取消'))
      }
      const timer = setTimeout(() => {
        finish(undefined, new Error('Brainstorming 编辑器响应超时'))
      }, MCP_LIMITS.timeout)
      signal.addEventListener('abort', abort, { once: true })
      this.pending.set(id, {
        owner: window.webContents.id,
        resolve: (data) => {
          finish(data)
        },
        reject: (error) => {
          finish(undefined, error)
        },
      })
      window.webContents.send('mcp:request', {
        id,
        sessionId: connection.sessionId,
        grant: {
          workbookId: connection.workbookId,
          includeNotes: connection.includeNotes,
          allowProposals: connection.allowProposals,
        },
        action,
      })
    })
  }

  reply = (owner: number, input: unknown): void => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return
    const reply = input as Partial<MCPBridgeReply>
    if (typeof reply.id !== 'string') return
    const pending = this.pending.get(reply.id)
    if (pending?.owner !== owner) return
    if (reply.ok === false && typeof reply.error === 'string')
      pending.reject(new Error(reply.error.slice(0, 300)))
    else if (
      reply.ok === true &&
      reply.data &&
      typeof reply.data === 'object' &&
      !Array.isArray(reply.data)
    ) {
      if (Buffer.byteLength(JSON.stringify(reply.data)) > MCP_LIMITS.replyBytes)
        pending.reject(new Error('读取结果过大，请减少 limit 或选择较小分支'))
      else pending.resolve(reply.data)
    }
  }

  cancel = (): void => {
    for (const pending of this.pending.values())
      pending.reject(new Error('Brainstorming 共享已停止'))
  }
}
