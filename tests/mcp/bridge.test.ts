import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { MCPRendererBridge } from '@main/mcp/bridge'
import type { MCPBridgeRequest, MCPConnection } from '@shared/mcp'

const connection: MCPConnection = {
  workbookId: 'workbook',
  allowProposals: false,
  includeNotes: false,
  sessionId: 'session',
  endpoint: 'http://127.0.0.1/mcp',
  token: 'secret-token',
}
const fixture = () => {
  const send = vi.fn<(channel: string, request: MCPBridgeRequest) => void>()
  const window = {
    isDestroyed: () => false,
    webContents: { id: 1, send },
  } as unknown as BrowserWindow
  const bridge = new MCPRendererBridge(
    () => window,
    () => connection,
  )
  return { bridge, send }
}
describe('MCP main/renderer bridge ownership and cancellation', () => {
  it('accepts only the owner reply and sends a bounded grant without the bearer token', async () => {
    const { bridge, send } = fixture()
    const result = bridge.request({ type: 'workbook' }, new AbortController().signal)
    const request = send.mock.calls[0]?.[1]
    expect(request).toMatchObject({ grant: { workbookId: 'workbook', includeNotes: false } })
    expect(JSON.stringify(request)).not.toContain('secret-token')
    if (!request) throw new Error('Missing bridge request')
    bridge.reply(2, { id: request.id, ok: true, data: { unauthorized: true } })
    bridge.reply(1, { id: 'unrelated', ok: true, data: {} })
    bridge.reply(1, { id: request.id, ok: true, data: { title: 'Shared' } })
    await expect(result).resolves.toEqual({ title: 'Shared' })
  })
  it('releases cancelled and timed-out requests and ignores their late replies', async () => {
    vi.useFakeTimers()
    try {
      const { bridge, send } = fixture()
      const controller = new AbortController()
      const first = bridge.request({ type: 'workbook' }, controller.signal)
      const rejected = expect(first).rejects.toThrow('已取消')
      controller.abort()
      await rejected
      const second = bridge.request({ type: 'workbook' }, new AbortController().signal)
      const timeout = expect(second).rejects.toThrow('响应超时')
      await vi.advanceTimersByTimeAsync(10_000)
      await timeout
      for (const call of send.mock.calls) bridge.reply(1, { id: call[1].id, ok: true, data: {} })
      const third = bridge.request({ type: 'workbook' }, new AbortController().signal)
      const stopped = expect(third).rejects.toThrow('共享已停止')
      bridge.cancel()
      await stopped
    } finally {
      vi.useRealTimers()
    }
  })
})
