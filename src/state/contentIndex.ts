import type { ContentSearchResult } from '@shared/contentSearch'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { createContentIndexSync } from '@renderer/state/contentIndexSync'

let active: ReturnType<typeof createContentIndexSync> | undefined

/** Subscribe once for the native application's lifetime, outside canvas rendering. */
export const startContentIndexSync = (): (() => void) => {
  active?.dispose()
  const sync = createContentIndexSync(requireDesktopAPI())
  active = sync
  return () => {
    sync.dispose()
    if (active === sync) active = undefined
  }
}

export interface ContentQueryOptions {
  readonly limit?: number
  readonly signal?: AbortSignal
}

export const queryContentIndex = async (
  query: string,
  { limit, signal }: ContentQueryOptions = {},
): Promise<readonly ContentSearchResult[]> => {
  const sync = active
  if (!sync) throw new Error('Content search is not initialized.')
  const assertCurrent = (): void => {
    signal?.throwIfAborted()
    if (!sync.alive || active !== sync) throw new DOMException('Search cancelled', 'AbortError')
  }
  // Await newer committed edits too if documents change during the native query.
  for (;;) {
    assertCurrent()
    await sync.flush()
    assertCurrent()
    const revision = sync.revision
    const results = await sync.api.searchContent({
      query,
      ...(limit === undefined ? {} : { limit }),
    })
    assertCurrent()
    if (sync.revision === revision) return results
  }
}
