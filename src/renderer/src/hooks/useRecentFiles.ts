import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import type { RecentFile } from '@shared/contracts'
import { queryClient } from '@renderer/lib/queryClient'

const recentFilesKey = ['recent-files'] as const

export const recentFilesOptions = () => {
  const bridge = window.trelyx
  return queryOptions({
    queryKey: [...recentFilesKey, bridge ? 'desktop' : 'browser'],
    queryFn: (): Promise<readonly RecentFile[]> =>
      bridge ? bridge.getRecentFiles() : Promise.resolve([]),
    retry: false,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })
}

export const useRecentFiles = (enabled = true, client: QueryClient = queryClient) => {
  return useQuery({ ...recentFilesOptions(), enabled }, client)
}

/** Call after a successful desktop open/save that changes the recent-file list. */
export const invalidateRecentFiles = (client: QueryClient = queryClient): Promise<void> => {
  return client.invalidateQueries({ queryKey: recentFilesKey })
}
