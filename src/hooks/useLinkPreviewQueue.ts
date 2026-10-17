import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import { useEffect } from 'react'
import { useEditor } from '@renderer/state/editor'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import type { MindMapWorkbook } from '@core'

/** Match the native queue's URL policy without bringing Node networking modules into renderer. */
export const previewQueueUrls = (values: readonly string[]): readonly string[] => {
  const urls = values.flatMap((value) => {
    try {
      if (value.length > 2048) return []
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return []
      url.hash = ''
      return [url.toString()]
    } catch {
      return []
    }
  })
  return [...new Set(urls)].sort().slice(0, 1000)
}

export const workbookPreviewUrls = (workbook: MindMapWorkbook): readonly string[] =>
  previewQueueUrls(
    workbook.sheets.flatMap((sheet) =>
      Object.values(sheet.document.topics).flatMap((topic) => {
        const link = topic.metadata?.link
        return link?.kind === 'url' ? [link.url] : []
      }),
    ),
  )

/** Submit one bounded batch; the main process owns queue concurrency and screenshot caching. */
export const useLinkPreviewQueue = (): void => {
  const workbook = useEditor((state) => state.workbook)
  const tabs = useDocumentTabs((state) => state.tabs)
  const hasDocument = useWorkspace((state) => state.hasDocument)
  const urls = previewQueueUrls([
    ...(hasDocument ? workbookPreviewUrls(workbook) : []),
    ...tabs
      .filter((tab) => tab.editor.workbook.id !== workbook.id)
      .flatMap((tab) => workbookPreviewUrls(tab.editor.workbook)),
  ])
  const urlsKey = JSON.stringify(urls)
  useEffect(
    () =>
      requireDesktopAPI().onLinkPreview(() => {
        void queryClient.invalidateQueries({ queryKey: ['link-preview'] })
      }),
    [],
  )
  useEffect(() => {
    const desired: string[] = JSON.parse(urlsKey) as string[]
    void requireDesktopAPI()
      .queueLinkPreviews(desired)
      .catch(() => {
        // Native queue failures are surfaced by the visible preview query and manual retry action.
      })
  }, [urlsKey])
}
