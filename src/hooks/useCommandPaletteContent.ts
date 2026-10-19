import { useDebounce } from 'ahooks'
import { useQuery } from '@tanstack/react-query'
import { queryContentIndex } from '@renderer/state/contentIndex'

/** Search stays in the native index; cmdk only filters the fixed action list. */
export const useCommandPaletteContent = (query: string, open: boolean) => {
  const trimmed = query.trim()
  const debounced = useDebounce(trimmed, { wait: 160 })
  const result = useQuery({
    queryKey: ['command-content', debounced],
    queryFn: ({ signal }) => queryContentIndex(debounced, { limit: 12, signal }),
    enabled: open && Boolean(debounced),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const pending = Boolean(trimmed) && (trimmed !== debounced || result.isFetching)
  return {
    results: trimmed === debounced ? (result.data ?? []) : [],
    pending,
    error: Boolean(trimmed) && trimmed === debounced && result.isError,
  }
}
