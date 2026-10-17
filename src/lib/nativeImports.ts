import { serializeWorkbook } from '@core'
import { decodeMarkdown, decodeOpml } from '@formats/interchange'
import { importXmind } from '@formats/xmind'
import type { OpenedDocument } from '@shared/contracts'

export interface ImportedSource {
  readonly name: string
  readonly bytes: readonly number[]
}
export type NativeOpenedDocument = OpenedDocument & { readonly importSource?: ImportedSource }

/** Third-party conversion stays in the existing bounded, platform-neutral format modules. */
export const normalizeOpenedDocument = (
  opened: NativeOpenedDocument | null,
): OpenedDocument | null => {
  if (!opened?.importSource) return opened
  const { importSource, ...document } = opened
  const bytes = Uint8Array.from(importSource.bytes)
  const extension = importSource.name.split('.').pop()?.toLowerCase()
  if (extension === 'xmind') {
    const imported = importXmind(bytes)
    return {
      ...document,
      path: null,
      contents: serializeWorkbook(imported.workbook),
      warnings: imported.warnings,
    }
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const workbook = extension === 'opml' ? decodeOpml(text) : decodeMarkdown(text)
  return { ...document, path: null, contents: serializeWorkbook(workbook) }
}

export const serializeDroppedFiles = async (files: readonly File[]) => {
  if (files.reduce((size, file) => size + file.size, 0) > 8 * 1024 * 1024)
    throw new Error('拖放的文件超过 8 MiB，请使用应用的文件选择器导入，或从文件管理器直接拖入。')
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mimeType: file.type,
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    })),
  )
}
