import { translate } from '@renderer/i18n'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { useEffect } from 'react'
import { queryClient } from '@renderer/lib/queryClient'
import { handleMCPRequest, useMCPProposals } from '@renderer/components/mcp/workspace'
import { MCP_LIMITS } from '@shared/mcp'

/** Keep the bridge alive independently of whether the settings dialog or Dock is mounted. */
export const useMCPBridge = (): void => {
  useEffect(() => {
    const api = requireDesktopAPI()
    const offRequest = api.onMCPRequest((request) => {
      try {
        const data = handleMCPRequest(request)
        if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MCP_LIMITS.replyBytes)
          throw new Error(translate('readResultIsTooLargeReduceThe'))
        api.replyMCPRequest({ id: request.id, ok: true, data })
      } catch (cause) {
        api.replyMCPRequest({
          id: request.id,
          ok: false,
          error:
            cause instanceof Error ? cause.message.slice(0, 300) : translate('trelyxRequestFailed'),
        })
      }
    })
    const offConnection = api.onMCPConnectionChanged((connection) => {
      queryClient.setQueryData(['mcp', 'connection'], connection)
      useMCPProposals.setState(({ proposals }) => ({
        proposals: proposals.filter((proposal) => proposal.sessionId === connection?.sessionId),
      }))
    })
    return () => {
      offRequest()
      offConnection()
    }
  }, [])
}
