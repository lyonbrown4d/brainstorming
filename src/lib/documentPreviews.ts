import { deserializeWorkbook } from '@core'
import { boundedRasterPng, prepareSheetImage } from '@renderer/export/images'
import { fitPreviewPng } from '@renderer/lib/documentPreviewImages'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { createDocumentPreviewQueue } from '@renderer/lib/documentPreviewQueue'
import { savedDocumentEditor, type DocumentSaveTarget } from '@renderer/state/documentSaveState'
import type { SheetPreviewImage } from '@shared/documentPreviews'

interface PreviewJob {
  readonly target: DocumentSaveTarget
  readonly contents: string
  readonly coverSheetId: string
}
const queue = createDocumentPreviewQueue<PreviewJob>(
  async ({ target, contents, coverSheetId }, queued, signal) => {
    const current = (): boolean => queued() && savedDocumentEditor(target) !== undefined
    if (!current()) return
    const api = requireDesktopAPI()
    const revision = await api.getDocumentPreviewRevision(target.workbookId, contents)
    if (!revision || !current()) return
    // Reconstruct the successful save, including an uncommitted text draft, instead
    // of reading a newer editor state while the background renderer is running.
    const workbook = deserializeWorkbook(contents)
    const sheets: SheetPreviewImage[] = []
    let total = 0
    const budget = Math.min(1024 * 1024, Math.floor((16 * 1024 * 1024) / workbook.sheets.length))
    for (const sheet of workbook.sheets) {
      if (!current()) return
      const source = await prepareSheetImage(workbook, sheet.id, false, signal)
      if (!current()) return
      const png = await fitPreviewPng(source, budget, signal, boundedRasterPng)
      if (!current() || !png) return
      if (total + png.length > 16 * 1024 * 1024) return
      total += png.length
      sheets.push({ sheetId: sheet.id, png: Array.from(png) })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    const first = sheets[0]
    if (!current() || !first) return
    await api.writeDocumentPreviews({
      documentId: target.workbookId,
      revision,
      coverSheetId: sheets.some((sheet) => sheet.sheetId === coverSheetId)
        ? coverSheetId
        : first.sheetId,
      sheets,
    })
  },
  () => {
    console.warn('Document preview update failed')
  },
)

/** Preview failures never change the successful save state or trigger a save retry. */
export const queueDocumentPreviews = (
  target: DocumentSaveTarget,
  contents: string,
  coverSheetId: string,
): void => {
  queue.enqueue(target.workbookId, { target, contents, coverSheetId })
}

export const cancelDocumentPreviews = (documentId: string): void => {
  queue.cancel(documentId)
}
