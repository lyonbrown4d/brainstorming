import { ContainerModule } from 'inversify'
import { MCPRendererBridge } from '@main/mcp/bridge'
import { EmbeddedMCPServer } from '@main/mcp/server'
import { MCPService } from '@main/mcp/application'
import { WindowSession } from '@main/application/session'

export const mcpModule = new ContainerModule(({ bind }) => {
  bind(MCPService)
    .toResolvedValue(
      (session: WindowSession) => {
        // The aggregate owns both collaborators. Only the connection lookup is delayed.
        const bridge: MCPRendererBridge = new MCPRendererBridge(session.getWindow, () =>
          server.getConnection(),
        )
        const server: EmbeddedMCPServer = new EmbeddedMCPServer(bridge.request)
        return new MCPService(session.getWindow, bridge, server)
      },
      [WindowSession],
    )
    .inSingletonScope()
    .onDeactivation((service) => service.dispose())
})
