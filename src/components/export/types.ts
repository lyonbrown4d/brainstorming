import type { MindMapWorkbook } from '@core'
import type { NativeImageExportRequest } from '@shared/exportImages'
import type { ExportRequest } from '@renderer/export/files'
import type { ExportFormat } from '@renderer/export/files'
import type { NativeImageFormat } from '@shared/exportImages'

export type DialogExportFormat = ExportFormat | NativeImageFormat
export const isNativeImageFormat = (value: string): value is NativeImageFormat =>
  ['png', 'jpg', 'webp', 'svg'].includes(value)
export const isDialogExportFormat = (value: string): value is DialogExportFormat =>
  ['png', 'jpg', 'webp', 'svg', 'pdf', 'md', 'opml', 'txt', 'xmind'].includes(value)
export const isVisualExport = (value: DialogExportFormat): boolean =>
  isNativeImageFormat(value) || value === 'pdf'

export interface ExportDialogProps {
  readonly workbook: MindMapWorkbook
  readonly currentSheetId: string
  readonly onExport?: (request: ExportRequest) => Promise<string | null>
  readonly onExportImage?: (request: NativeImageExportRequest) => Promise<string | null>
  readonly defaultOpen?: boolean
}
