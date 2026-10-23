import type { MindMapWorkbook } from '@core'
import {
  ExportContent,
  type DocumentExportRequest,
  type DocumentExportsAPI,
} from '@shared/documentExports'
import type { VisualGeometry } from '@shared/compute'
import { prepareMarkerIcons } from '@shared/markerIcons'
import { fetchNativeLayout, layoutMeasurements } from '@renderer/lib/nativeLayout'
import { buildVisualGeometry } from '@renderer/lib/visualGeometry'
import { flushNativeEditor } from '@renderer/state/nativeEditorQueue'
import { useEditor } from '@renderer/state/editor'

const needsGeometry = new Set(['png', 'jpg', 'webp', 'svg', 'pdf', 'html'])

/** Resolve pending editor commands, then use the native selection and one geometry map per sheet. */
export const prepareDocumentExport = async (
  api: DocumentExportsAPI,
  request: DocumentExportRequest,
): Promise<DocumentExportRequest> => {
  await flushNativeEditor(request.workbook.id)
  const latest = useEditor.getState().workbook
  const workbook: MindMapWorkbook = latest.id === request.workbook.id ? latest : request.workbook
  const selected = await api.prepare({ ...request, workbook })
  if (
    !needsGeometry.has(request.format) ||
    request.view ||
    request.content === ExportContent.Presentation
  ) {
    return { ...request, workbook: selected }
  }
  await document.fonts.ready
  const geometry: Record<string, VisualGeometry> = {}
  for (const sheet of selected.sheets) {
    const source = request.includeCollapsed
      ? {
          ...sheet.document,
          topics: Object.fromEntries(
            Object.values(sheet.document.topics).map((topic) => [
              topic.id,
              { ...topic, collapsed: false },
            ]),
          ),
        }
      : sheet.document
    await prepareMarkerIcons(source)
    const measurements = layoutMeasurements(source)
    const layout = await fetchNativeLayout(source, sheet.id, measurements)
    geometry[sheet.id] = buildVisualGeometry(source, layout, measurements)
  }
  return { ...request, workbook: selected, geometry }
}
