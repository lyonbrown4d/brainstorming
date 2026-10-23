import {
  DocumentExportFormat,
  ExportContent,
  ExportScope,
  type PdfExportOptions,
} from '@shared/documentExports'
import type { DocumentExportFormat as DocumentExportFormatType } from '@shared/documentExports'
export type { ExportContent, ExportScope } from '@shared/documentExports'

export const groups = {
  images: [
    DocumentExportFormat.Png,
    DocumentExportFormat.Jpg,
    DocumentExportFormat.Webp,
    DocumentExportFormat.Svg,
  ],
  documents: [DocumentExportFormat.Pdf, DocumentExportFormat.Docx, DocumentExportFormat.Html],
  presentation: [DocumentExportFormat.Pptx],
  interchange: [
    DocumentExportFormat.Md,
    DocumentExportFormat.Opml,
    DocumentExportFormat.Txt,
    DocumentExportFormat.Xmind,
    DocumentExportFormat.Csv,
    DocumentExportFormat.Json,
  ],
} as const satisfies Record<string, readonly DocumentExportFormatType[]>
export type ExportGroup = keyof typeof groups

export const visualFormats = new Set<DocumentExportFormatType>([
  ...groups.images,
  DocumentExportFormat.Pdf,
  DocumentExportFormat.Pptx,
])
export const rasterFormats = new Set<DocumentExportFormatType>([
  DocumentExportFormat.Png,
  DocumentExportFormat.Jpg,
  DocumentExportFormat.Webp,
])
export const viewFormats = new Set<DocumentExportFormatType>([
  ...rasterFormats,
  DocumentExportFormat.Pdf,
])

export interface ExportPreferences {
  readonly version: 2
  readonly group: ExportGroup
  readonly format: DocumentExportFormatType
  readonly scope: ExportScope
  readonly content: ExportContent
  readonly includeCollapsed: boolean
  readonly transparent: boolean
  readonly scale: string
  readonly width: string
  readonly height: string
  readonly jpegQuality: string
  readonly pdf: PdfExportOptions
}

export const defaultExportPreferences: ExportPreferences = {
  version: 2,
  group: 'images',
  format: DocumentExportFormat.Png,
  scope: ExportScope.Current,
  content: ExportContent.Map,
  includeCollapsed: false,
  transparent: false,
  scale: 'auto',
  width: '',
  height: '',
  jpegQuality: '92',
  pdf: { paper: 'auto', orientation: 'auto', marginMm: 12, paginate: false },
}

export const sanitizeExportPreferences = (value: unknown): ExportPreferences => {
  if (!value || typeof value !== 'object') return defaultExportPreferences
  const raw = value as Record<string, unknown>
  if (raw.version !== 2) return defaultExportPreferences
  const group = Object.keys(groups).find((key) => key === raw.group) as ExportGroup | undefined
  const format = group && groups[group].find((item) => item === raw.format)
  const pdf = raw.pdf && typeof raw.pdf === 'object' ? (raw.pdf as Record<string, unknown>) : {}
  const defaults = defaultExportPreferences
  const scope = Object.values(ExportScope).find((item) => item === raw.scope)
  const content =
    Object.values(ExportContent).find((item) => item === raw.content) ?? ExportContent.Map
  const paper = ['auto', 'a4', 'a3', 'letter'].find((item) => item === pdf.paper) as
    PdfExportOptions['paper'] | undefined
  const orientation = ['auto', 'portrait', 'landscape'].find((item) => item === pdf.orientation) as
    PdfExportOptions['orientation'] | undefined
  const marginMm =
    typeof pdf.marginMm === 'number' &&
    Number.isFinite(pdf.marginMm) &&
    pdf.marginMm >= 0 &&
    pdf.marginMm <= 50
      ? pdf.marginMm
      : 12
  const numeric = (input: unknown, fallback: string): string =>
    typeof input === 'string' && /^\d{0,5}$/.test(input) ? input : fallback
  return {
    version: 2,
    group: group ?? defaults.group,
    format: format ?? (group ? groups[group][0] : defaults.format),
    scope: scope ?? defaults.scope,
    content,
    includeCollapsed: raw.includeCollapsed === true,
    transparent: raw.transparent === true,
    scale: ['auto', '1', '2', '3', 'custom'].find((item) => item === raw.scale) ?? 'auto',
    width: numeric(raw.width, ''),
    height: numeric(raw.height, ''),
    jpegQuality: numeric(raw.jpegQuality, '92'),
    pdf: {
      paper: paper ?? 'auto',
      orientation: orientation ?? 'auto',
      marginMm,
      paginate: pdf.paginate === true,
    },
  }
}
