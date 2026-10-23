import type { MindMapWorkbook } from '@core'
import type { VisualGeometry } from '@shared/compute'

import type {
  ExportFormat as NativeExportFormat,
  ExportScope as NativeExportScope,
  ExportContent as NativeExportContent,
  ExportStage as NativeExportStage,
  Paper as NativePdfPaper,
  Orientation as NativePdfOrientation,
} from '@renderer/generated/native'

export type DocumentExportFormat = NativeExportFormat
export type ExportScope = NativeExportScope
export type ExportContent = NativeExportContent
export type DocumentExportStage = NativeExportStage
export const DocumentExportFormat = {
  Png: 'png',
  Jpg: 'jpg',
  Webp: 'webp',
  Svg: 'svg',
  Pdf: 'pdf',
  Pptx: 'pptx',
  Docx: 'docx',
  Html: 'html',
  Md: 'md',
  Opml: 'opml',
  Txt: 'txt',
  Xmind: 'xmind',
  Csv: 'csv',
  Json: 'json',
} as const satisfies Record<string, DocumentExportFormat>
export const documentExportFormats = Object.values(DocumentExportFormat)
export const ExportScope = {
  Current: 'current',
  All: 'all',
  Sheets: 'sheets',
  Topics: 'topics',
  Branch: 'branch',
} as const satisfies Record<string, NativeExportScope>
export const ExportContent = {
  Map: 'map',
  Presentation: 'presentation',
  View: 'view',
} as const satisfies Record<string, NativeExportContent>
export const DocumentExportStage = {
  Queued: 'queued',
  Preparing: 'preparing',
  Rendering: 'rendering',
  Choosing: 'choosing',
  Encoding: 'encoding',
  Writing: 'writing',
  Done: 'done',
} as const satisfies Record<string, NativeExportStage>
export interface ExportPage {
  readonly title: string
  readonly svg: string
  readonly width: number
  readonly height: number
}
export interface PdfExportOptions {
  readonly paper: NativePdfPaper
  readonly orientation: NativePdfOrientation
  readonly marginMm: number
  readonly paginate: boolean
}
export interface DocumentExportRequest {
  readonly jobId: string
  readonly workbook: MindMapWorkbook
  readonly format: DocumentExportFormat
  readonly sheetIds: readonly string[]
  readonly topicIds?: readonly string[]
  readonly drawingIds?: readonly string[]
  readonly scope?: ExportScope
  readonly content?: ExportContent
  readonly includeCollapsed?: boolean
  readonly transparent?: boolean
  readonly scale?: number
  readonly width?: number
  readonly height?: number
  readonly jpegQuality?: number
  readonly pdf?: PdfExportOptions
  readonly geometry?: Readonly<Record<string, VisualGeometry>>
  readonly view?: ExportPage
}
export interface DocumentExportProgress {
  readonly jobId: string
  readonly stage: DocumentExportStage
  readonly completed: number
  readonly total: number
}
export interface ExportCaptureBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly viewportWidth: number
  readonly viewportHeight: number
}
export interface DocumentExportsAPI {
  preview?(request: DocumentExportRequest): Promise<ExportPage>
  captureView?(bounds: ExportCaptureBounds): Promise<ExportPage>
  prepare(request: DocumentExportRequest): Promise<MindMapWorkbook>
  exportDocument(request: DocumentExportRequest): Promise<string | null>
  presentationPages(
    workbook: MindMapWorkbook,
    sheetIds: readonly string[],
  ): Promise<readonly ExportPage[]>
  cancel(jobId: string): Promise<boolean>
  onProgress(callback: (progress: DocumentExportProgress) => void): () => void
  openResult(path: string, reveal: boolean): Promise<void>
}
