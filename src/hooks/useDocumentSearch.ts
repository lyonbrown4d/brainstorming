import { useDebounce } from 'ahooks'
import { useQuery } from '@tanstack/react-query'
import type { SearchOptions } from '@core'
import { queryClient } from '@renderer/lib/queryClient'
import { queryDocumentMatches } from '@renderer/state/contentIndex'
import { useContentIndexRevision } from '@renderer/state/contentIndexRevision'

/** Query the synchronized native index without retaining old full-text result sets. */
export const useDocumentSearch = (
  workbookId: string,
  query: string,
  options: SearchOptions,
  open: boolean,
) => {
  const debounced = useDebounce(query, { wait: 160 })
  const revision = useContentIndexRevision((state) => state.revision)
  const result = useQuery(
    {
      queryKey: [
        'document-search',
        workbookId,
        revision,
        debounced,
        options.matchCase,
        options.wholeWord,
        options.includeNotes,
        options.sheetId,
      ],
      queryFn: ({ signal }) =>
        queryDocumentMatches({ workbookId, query: debounced, ...options }, signal),
      enabled: open && Boolean(debounced),
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
    },
    queryClient,
  )
  const current = open && query === debounced && Boolean(query)
  return {
    results: current ? (result.data ?? []) : [],
    loading: current
      ? result.isPending || result.isFetching
      : Boolean(open && query && query !== debounced),
    error: current ? result.error : null,
    retry: result.refetch,
  }
}
