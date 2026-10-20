import { searchWorkbook, type SearchMatch, type SearchOptions } from '@core'
import type { ContentSearchResult } from '@shared/contentSearch'
import { getPlatformAPI, requireDesktopAPI } from '@renderer/lib/desktop'
import { createContentIndexSync } from '@renderer/state/contentIndexSync'
import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { flushNativeEditor } from '@renderer/state/nativeEditorQueue'
import { publishContentIndexRevision } from '@renderer/state/contentIndexRevision'

let active: ReturnType<typeof createContentIndexSync> | undefined

/** Subscribe once for the native application's lifetime, outside canvas rendering. */
export const startContentIndexSync = (): (() => void) => {
  active?.dispose()
  let registered = false
  const sync = createContentIndexSync(requireDesktopAPI(), () => {
    if (registered) publishContentIndexRevision()
  })
  active = sync
  registered = true
  publishContentIndexRevision()
  return () => {
    registered = false
    sync.dispose()
    if (active === sync) {
      active = undefined
      publishContentIndexRevision()
    }
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
    await flushNativeEditor()
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

export const queryDocumentMatches = async (
  input: { readonly workbookId: string; readonly query: string } & SearchOptions,
  signal?: AbortSignal,
): Promise<SearchMatch[]> => {
  const sync = active
  if (!sync) throw new Error('Document search index is not initialized.')
  const assertCurrent = (): void => {
    signal?.throwIfAborted()
    if (!sync.alive || active !== sync) throw new DOMException('Search cancelled', 'AbortError')
  }
  for (;;) {
    assertCurrent()
    await flushNativeEditor(input.workbookId)
    assertCurrent()
    await sync.flush()
    assertCurrent()
    const revision = sync.revision
    const compute = getPlatformAPI()?.compute
    const results = compute
      ? await compute.find(input)
      : (() => {
          const editor = useEditor.getState()
          const workbook =
            editor.workbook.id === input.workbookId
              ? editor.workbook
              : useDocumentTabs
                  .getState()
                  .tabs.find((tab) => tab.editor.workbook.id === input.workbookId)?.editor.workbook
          if (!workbook) throw new Error('Document search index is not initialized.')
          return searchWorkbook(workbook, input.query, input)
        })()
    assertCurrent()
    if (sync.revision === revision) return results
  }
}
