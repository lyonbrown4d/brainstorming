export const exportFormats = ['png', 'svg', 'pdf', 'md', 'opml', 'txt', 'xmind'] as const
export type ExportFormat = (typeof exportFormats)[number]
export interface ExportRequest {
  format: ExportFormat
  suggestedName: string
  bytes: Uint8Array
}
