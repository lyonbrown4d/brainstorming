import { commands } from '@renderer/generated/native'
import { z } from 'zod'
import type { MindMapWorkbook } from '@core'
import type {
  DocumentExportProgress,
  DocumentExportRequest,
  DocumentExportsAPI,
  ExportPage,
} from '@shared/documentExports'

export const documentExportProgressSchema = z.object({
  jobId: z.uuid(),
  stage: z.enum(['queued', 'preparing', 'rendering', 'choosing', 'encoding', 'writing', 'done']),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
const wire = (value: object): Parameters<typeof commands.documentExportStart>[0] =>
  value as unknown as Parameters<typeof commands.documentExportStart>[0]
const invoke = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}
export const createDocumentExportsAPI = (
  subscribe: (callback: (progress: DocumentExportProgress) => void) => () => void,
): DocumentExportsAPI => ({
  preview: (request) =>
    invoke(
      async () => (await commands.documentExportPreview(wire(request))) as unknown as ExportPage,
    ),
  captureView: (bounds) =>
    invoke(
      async () => (await commands.documentExportCapture(wire(bounds))) as unknown as ExportPage,
    ),
  prepare: (request) =>
    invoke(
      async () =>
        (await commands.documentExportPrepare(wire(request))) as unknown as MindMapWorkbook,
    ),
  exportDocument: (request) => invoke(() => commands.documentExportStart(wire(request))),
  presentationPages: (workbook, sheetIds) =>
    invoke(async () => {
      const request: DocumentExportRequest = {
        jobId: crypto.randomUUID(),
        workbook,
        sheetIds,
        format: 'pdf',
        content: 'presentation',
      }
      return (await commands.documentExportPresentation(
        wire(request),
      )) as unknown as readonly ExportPage[]
    }),
  cancel: (id) => invoke(() => commands.documentExportCancel(id)),
  onProgress: subscribe,
  openResult: (path, reveal) =>
    invoke(async () => {
      await commands.documentExportReveal(path, reveal)
    }),
})
