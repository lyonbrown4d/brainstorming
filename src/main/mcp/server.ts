import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server'
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { MCP_LIMITS, type MCPConnection, type MCPStart } from '@shared/mcp'
import { createTrelyxMCPServer, type MCPDispatch } from '@main/mcp/tools'

export class EmbeddedMCPServer {
  private server: Server | null = null
  private handler: McpHttpHandler | null = null
  private connection: MCPConnection | null = null
  private transition = false
  constructor(private readonly dispatch: MCPDispatch) {}

  getConnection = (): MCPConnection | null => this.connection

  start = async (grant: MCPStart): Promise<MCPConnection> => {
    if (this.transition || this.server) throw new Error('MCP 已启用或正在切换，请先停止连接')
    this.transition = true
    const token = randomBytes(32).toString('base64url')
    const expectedAuth = Buffer.from(`Bearer ${token}`)
    const handler = createMcpHandler(
      () => createTrelyxMCPServer(this.dispatch, grant.allowProposals),
      {
        legacy: 'stateless',
        maxRequestBodySize: MCP_LIMITS.bodyBytes,
        maxSubscriptions: 0,
      },
    )
    const handle = toNodeHandler(handler, { maxRequestBodySize: MCP_LIMITS.bodyBytes })
    const validHost = hostHeaderValidation(['127.0.0.1'])
    const validOrigin = originValidation([])
    let active = 0
    const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      if (!validHost(request, response) || !validOrigin(request, response)) return
      if (request.url !== '/mcp') {
        response.writeHead(404).end()
        return
      }
      const auth = Buffer.from(request.headers.authorization ?? '')
      if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) {
        response.writeHead(401).end()
        return
      }
      if (!this.connection) {
        response.writeHead(503).end()
        return
      }
      if (active >= 8) {
        response.writeHead(429).end()
        return
      }
      active++
      let finished = false
      const done = (): void => {
        if (finished) return
        finished = true
        active--
      }
      response.once('close', done)
      response.once('finish', done)
      response.setTimeout(MCP_LIMITS.timeout + 1000, () => response.destroy())
      // The SDK's optional method/url omit explicit undefined; Node permits it at the type level.
      void handle(request as Parameters<typeof handle>[0], response).catch(() => {
        if (!response.headersSent) response.writeHead(500)
        response.end()
      })
    })
    server.requestTimeout = MCP_LIMITS.timeout
    server.headersTimeout = 5000
    server.keepAliveTimeout = 1000
    server.maxHeadersCount = 40
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject)
          resolve()
        })
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('MCP 端口不可用')
      this.server = server
      this.handler = handler
      this.connection = {
        ...grant,
        sessionId: randomUUID(),
        endpoint: `http://127.0.0.1:${address.port}/mcp`,
        token,
      }
      return this.connection
    } catch {
      server.close()
      await handler.close()
      throw new Error('无法启动本机 MCP 服务')
    } finally {
      this.transition = false
    }
  }

  stop = async (): Promise<void> => {
    if (this.transition) throw new Error('MCP 正在启动，请稍后重试')
    const server = this.server
    const handler = this.handler
    this.connection = null
    this.server = null
    this.handler = null
    if (!server) return
    this.transition = true
    try {
      server.closeAllConnections()
      await Promise.all([
        handler?.close(),
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve()
          })
        }),
      ])
    } finally {
      this.transition = false
    }
  }
}
