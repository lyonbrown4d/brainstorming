import type { DocumentExportRequest, DocumentExportsAPI } from '@shared/documentExports'
import { flushNativeEditor } from '@renderer/state/nativeEditorQueue'
import { useEditor } from '@renderer/state/editor'

/** Freeze committed content; canonical native geometry is shared with the CLI. */
export const prepareDocumentExport = async (
  api: DocumentExportsAPI,
  request: DocumentExportRequest,
): Promise<DocumentExportRequest> => {
  await flushNativeEditor(request.workbook.id)
  const latest = useEditor.getState().workbook
  const workbook = latest.id === request.workbook.id ? latest : request.workbook
  const selected = await api.prepare({ ...request, workbook })
  return { ...request, workbook: selected, geometry: {} }
}
