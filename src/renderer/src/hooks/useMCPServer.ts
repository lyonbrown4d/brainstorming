import { translate } from '@renderer/i18n'
import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '@renderer/lib/queryClient'
import type { MCPAPI, MCPConnection, MCPStart } from '@shared/mcp'

export const useMCPServer = (api: MCPAPI | undefined, open: boolean) => {
  const connection = useQuery(
    {
      queryKey: ['mcp', 'connection'],
      queryFn: (): Promise<MCPConnection | null> =>
        api ? api.getMCPConnection() : Promise.resolve(null),
      enabled: !!api && open,
      retry: false,
      refetchOnWindowFocus: false,
    },
    queryClient,
  )
  const update = useMutation(
    {
      mutationFn: async (input: MCPStart | null): Promise<MCPConnection | null> => {
        if (!api) throw new Error(translate('mcpRequiresTheBrainstormingDesktopAppLabel827'))
        if (input) return api.startMCPServer(input)
        await api.stopMCPServer()
        return null
      },
      onMutate: () => queryClient.cancelQueries({ queryKey: ['mcp', 'connection'] }),
      onSuccess: (value) => {
        queryClient.setQueryData(['mcp', 'connection'], value)
      },
    },
    queryClient,
  )
  return { connection, update }
}
