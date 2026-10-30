import { deserializeWorkbook } from '@core'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { createDocumentPreviewQueue } from '@renderer/lib/documentPreviewQueue'
import { savedDocumentEditor, type DocumentSaveTarget } from '@renderer/state/documentSaveState'

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
    deserializeWorkbook(contents)
    signal.throwIfAborted()
    if (!current()) return
    await compute.refreshPreviews({
      documentId: target.workbookId,
      contents,
      coverSheetId,
      geometry: {},
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
