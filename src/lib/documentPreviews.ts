import { deserializeWorkbook } from '@core'
import { prepareMarkerIcons } from '@shared/markerIcons'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { fetchNativeLayout, layoutMeasurements } from '@renderer/lib/nativeLayout'
import { buildVisualGeometry } from '@renderer/lib/visualGeometry'
import { createDocumentPreviewQueue } from '@renderer/lib/documentPreviewQueue'
import { savedDocumentEditor, type DocumentSaveTarget } from '@renderer/state/documentSaveState'
import type { VisualGeometry } from '@shared/compute'

interface PreviewJob {
  readonly target: DocumentSaveTarget
  readonly contents: string
  readonly coverSheetId: string
}
const queue = createDocumentPreviewQueue<PreviewJob>(
  async ({ target, contents, coverSheetId }, queued, signal) => {
    const current = (): boolean => queued() && savedDocumentEditor(target) !== undefined
    if (!current()) return
    const compute = requireDesktopAPI().compute
    if (!compute) return
    // Reconstruct the successful save, including an uncommitted text draft, instead
    // of reading a newer editor state while the background renderer is running.
    const workbook = deserializeWorkbook(contents)
    await prepareMarkerIcons(workbook)
    const geometry: Record<string, VisualGeometry> = {}
    for (const sheet of workbook.sheets) {
      signal.throwIfAborted()
      if (!current()) return
      const measurements = layoutMeasurements(sheet.document)
      const layout = await fetchNativeLayout(sheet.document, sheet.id, measurements)
      signal.throwIfAborted()
      if (!current()) return
      geometry[sheet.id] = buildVisualGeometry(sheet.document, layout, measurements)
    }
    if (!current()) return
    await compute.refreshPreviews({
      documentId: target.workbookId,
      contents,
      coverSheetId,
      geometry,
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
