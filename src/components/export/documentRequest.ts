import type { MindMapWorkbook } from '@core'
import {
  DocumentExportFormat,
  ExportContent,
  ExportScope,
  type DocumentExportRequest,
  type DocumentExportsAPI,
} from '@shared/documentExports'
import { captureCurrentExportView } from '@renderer/export/captureCurrentExportView'
import type { ExportPreferences } from '@renderer/components/export/documentOptions'

export const buildDocumentExportRequest = async ({
  jobId,
  workbook,
  api,
  prefs,
  sheetIds,
  selectedTopics,
  selectedDrawings,
  content,
}: {
  readonly jobId: string
  readonly workbook: MindMapWorkbook
  readonly api: DocumentExportsAPI
  readonly prefs: ExportPreferences
  readonly sheetIds: readonly string[]
  readonly selectedTopics: readonly string[]
  readonly selectedDrawings: readonly string[]
  readonly content: ExportContent
}): Promise<DocumentExportRequest> => {
  const viewMode = content === ExportContent.View
  const raster = [
    DocumentExportFormat.Png,
    DocumentExportFormat.Jpg,
    DocumentExportFormat.Webp,
  ].some((format) => format === prefs.format)
  return {
    jobId,
    workbook,
    format: prefs.format,
    sheetIds,
    ...(prefs.scope === ExportScope.Topics || prefs.scope === ExportScope.Branch
      ? {
          topicIds: prefs.scope === ExportScope.Branch ? selectedTopics.slice(-1) : selectedTopics,
          drawingIds: prefs.scope === ExportScope.Topics ? selectedDrawings : [],
        }
      : {}),
    scope: viewMode ? ExportScope.Current : prefs.scope,
    content,
    includeCollapsed: prefs.includeCollapsed,
    transparent: !viewMode && prefs.format !== DocumentExportFormat.Jpg && prefs.transparent,
    ...(raster
      ? prefs.scale === 'custom'
        ? { width: Number(prefs.width), height: Number(prefs.height) }
        : prefs.scale === 'auto'
          ? {}
          : { scale: Number(prefs.scale) }
      : {}),
    ...(prefs.format === DocumentExportFormat.Jpg
      ? { jpegQuality: Number(prefs.jpegQuality) }
      : {}),
    ...(prefs.format === DocumentExportFormat.Pdf ? { pdf: prefs.pdf } : {}),
    ...(viewMode ? { view: await captureCurrentExportView(api) } : {}),
  }
}
