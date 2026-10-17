import { requireDesktopAPI } from '@renderer/lib/desktop'
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import type { RecentFile } from '@shared/contracts'
import { queryClient } from '@renderer/lib/queryClient'

const recentFilesKey = ['recent-files'] as const

export const recentFilesOptions = () => {
  return queryOptions({
    queryKey: recentFilesKey,
    queryFn: (): Promise<readonly RecentFile[]> => requireDesktopAPI().getRecentFiles(),
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
