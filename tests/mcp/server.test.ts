import { afterEach, describe, expect, it, vi } from 'vitest'
import { request as httpRequest } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { EmbeddedMCPServer } from '@main/mcp/server'
import type { MCPAction, MCPConnection } from '@shared/mcp'
import { MCP_LIMITS } from '@shared/mcp'

const servers: EmbeddedMCPServer[] = []
const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await Promise.all(servers.splice(0).map((server) => server.stop()))
})
const fixture = async (allowProposals = false) => {
  const dispatch = vi.fn<(action: MCPAction) => Promise<Record<string, unknown>>>((action) =>
    Promise.resolve({ action: action.type, workbookId: 'shared-workbook' }),
  )
  const server = new EmbeddedMCPServer(dispatch)
  servers.push(server)
  expect(server.getConnection()).toBeNull()
  const connection = await server.start({
    workbookId: 'shared-workbook',
    includeNotes: false,
    allowProposals,
  })
  return { server, connection, dispatch }
}
const connect = async (connection: MCPConnection, legacy = false) => {
  const client = new Client(
    { name: 'brainstorming-integration-test', version: '1.0.0' },
    legacy ? { supportedProtocolVersions: ['2025-11-25'] } : {},
  )
  clients.push(client)
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${connection.token}` } },
    }),
  )
  return client
}

describe('embedded official MCP HTTP transport', () => {
  it.each([false, true])('serves SDK discovery and real tool calls (legacy=%s)', async (legacy) => {
    const { connection, dispatch } = await fixture()
    const client = await connect(connection, legacy)
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(['get_workbook', 'read_branch'])
    const result = await client.callTool({ name: 'get_workbook', arguments: {} })
    expect(result).toMatchObject({
      structuredContent: { workbookId: 'shared-workbook', action: 'workbook' },
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'workbook' }, expect.any(AbortSignal))
    await expect(client.callTool({ name: 'propose_edit', arguments: {} })).rejects.toThrow()
  })

  it('rejects missing/incorrect tokens, hostile origins, DNS rebinding, malformed and oversized bodies', async () => {
    const { connection, dispatch } = await fixture()
    const headers = {
      Authorization: `Bearer ${connection.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    expect((await fetch(connection.endpoint, { method: 'POST', body: '{}' })).status).toBe(401)
    expect(
      (
        await fetch(connection.endpoint, {
          method: 'POST',
          headers: { ...headers, Authorization: 'Bearer wrong' },
          body: '{}',
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await fetch(connection.endpoint, {
          method: 'POST',
          headers: { ...headers, Origin: 'https://malicious.invalid' },
          body: '{}',
        })
      ).status,
    ).toBe(403)
    // fetch can replace Host; use a raw HTTP request to exercise DNS rebinding protection.
    const hostileHostStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        connection.endpoint,
        {
          method: 'POST',
          headers: { ...headers, Host: 'malicious.invalid' },
        },
        (response) => {
          response.resume()
          resolve(response.statusCode ?? 0)
        },
      )
      request.once('error', reject)
      request.end('{}')
    })
    expect(hostileHostStatus).toBe(403)
    expect(
      (await fetch(connection.endpoint, { method: 'POST', headers, body: '{broken' })).status,
    ).toBe(400)
    expect(
      (
        await fetch(connection.endpoint, {
          method: 'POST',
          headers,
          body: 'x'.repeat(MCP_LIMITS.bodyBytes + 1),
        })
      ).status,
    ).toBe(413)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('exposes proposal tools only with explicit permission and reports tool errors without leaking internal diagnostics', async () => {
    const { connection, dispatch } = await fixture(true)
    const client = await connect(connection)
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('propose_edit')
    dispatch.mockRejectedValueOnce(new Error('画布已改变，请重新读取'))
    const failed = await client.callTool({ name: 'read_branch', arguments: { sheetId: 'sheet' } })
    expect(failed).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: '画布已改变，请重新读取' }],
    })
    expect(JSON.stringify(failed)).not.toContain(connection.token)
  })

  it('invalidates the connection on stop, rotates credentials on restart and refuses duplicate starts', async () => {
    const { server, connection } = await fixture()
    await expect(
      server.start({ workbookId: 'other', allowProposals: false, includeNotes: false }),
    ).rejects.toThrow('已启用')
    await server.stop()
    expect(server.getConnection()).toBeNull()
    await expect(fetch(connection.endpoint)).rejects.toThrow()
    const restarted = await server.start({
      workbookId: 'shared-workbook',
      includeNotes: true,
      allowProposals: false,
    })
    expect(restarted.token).not.toBe(connection.token)
    expect(
      (
        await fetch(restarted.endpoint, {
          headers: { Authorization: `Bearer ${connection.token}` },
        })
      ).status,
    ).toBe(401)
  })
})
