import type { MCPAPI } from '@shared/mcp'

/** Inactive bridge for tests that exercise unrelated window/file behavior. */
export const inactiveMCP: MCPAPI = {
  getMCPConnection: () => Promise.resolve(null),
  startMCPServer: () => Promise.reject(new Error('本测试未启用 MCP')),
  stopMCPServer: () => Promise.resolve(),
  onMCPRequest: () => () => undefined,
  replyMCPRequest: () => undefined,
  onMCPConnectionChanged: () => () => undefined,
}
