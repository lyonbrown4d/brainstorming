import type { IPCRegistry, TrustedWindow } from '@main/application/ipcRegistry'
import type { MCPService } from '@main/mcp/application'

export const registerMCPIPC = (ipc: IPCRegistry, trusted: TrustedWindow, mcp: MCPService): void => {
  ipc.handle('mcp:connection', (event) => {
    trusted(event)
    return mcp.getConnection()
  })
  ipc.handle('mcp:start', (event, input: unknown) => {
    const window = trusted(event)
    return mcp.start(window, event.senderFrame, input)
  })
  ipc.handle('mcp:stop', (event) => {
    trusted(event)
    return mcp.stop()
  })
  ipc.on('mcp:reply', (event, input: unknown) => {
    try {
      trusted(event)
      mcp.reply(event.sender.id, input)
    } catch {
      /* Ignore untrusted notifications. */
    }
  })
}
