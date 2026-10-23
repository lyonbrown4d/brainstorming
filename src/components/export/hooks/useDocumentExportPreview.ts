import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MindMapWorkbook } from '@core'
import {
  ExportContent,
  type DocumentExportFormat,
  type DocumentExportsAPI,
  type ExportPage,
  type ExportScope,
} from '@shared/documentExports'
import { prepareSheetImage } from '@renderer/export/images'
import { prepareDocumentExport } from '@renderer/export/prepareDocumentExport'

const revisionIds = new WeakMap<object, number>()
let nextRevisionId = 1
const revisionOf = (workbook: MindMapWorkbook): number => {
  const saved = revisionIds.get(workbook)
  if (saved) return saved
  const next = nextRevisionId++
  revisionIds.set(workbook, next)
  return next
}

export const useDocumentExportPreview = (
  api: DocumentExportsAPI,
  workbook: MindMapWorkbook,
  sheetIds: readonly string[],
  presentation: boolean,
  includeCollapsed: boolean,
  enabled: boolean,
  format: DocumentExportFormat,
  topicIds: readonly string[],
  drawingIds: readonly string[],
  scope: ExportScope,
) => {
  const sheetId = sheetIds[0] ?? ''
  const query = useQuery({
    queryKey: [
      'document-export-preview',
      workbook.id,
      revisionOf(workbook),
      sheetIds.join(','),
      presentation,
      includeCollapsed,
      format,
      topicIds.join(','),
      drawingIds.join(','),
      scope,
    ],
    queryFn: async ({ signal }): Promise<readonly ExportPage[]> => {
      const request = {
        jobId: crypto.randomUUID(),
        workbook,
        format,
        sheetIds,
        ...(topicIds.length ? { topicIds } : {}),
        ...(drawingIds.length ? { drawingIds } : {}),
        scope,
        content: presentation ? ExportContent.Presentation : ExportContent.Map,
        includeCollapsed,
      }
      if (!presentation && topicIds.length === 0 && drawingIds.length > 0 && api.preview) {
        const prepared = await prepareDocumentExport(api, request)
        signal.throwIfAborted()
        return [await api.preview(prepared)]
      }
      const selected = await api.prepare(request)
      signal.throwIfAborted()
      if (presentation) return api.presentationPages(selected, sheetIds)
      if (!sheetId) return []
      const sheet = selected.sheets.find((item) => item.id === sheetId)
      if (!sheet) return []
      const image = await prepareSheetImage(selected, sheetId, includeCollapsed, signal)
      return [{ title: sheet.name, ...image }]
    },
    staleTime: 30_000,
    gcTime: 0,
    enabled: enabled && sheetIds.length > 0,
  })
  const [index, setIndex] = useState(0)
  const pages = query.data ?? []
  const page = pages[Math.min(index, pages.length - 1)] ?? null
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!page) return
    const next = URL.createObjectURL(new Blob([page.svg], { type: 'image/svg+xml;charset=utf-8' }))
    setUrl(next)
    return () => {
      URL.revokeObjectURL(next)
      setUrl(null)
    }
  }, [page])
  return {
    ...query,
    page,
    pages,
    index: Math.min(index, Math.max(0, pages.length - 1)),
    setIndex,
    url,
  }
}
