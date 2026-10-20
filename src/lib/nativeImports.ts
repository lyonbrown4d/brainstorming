import type { OpenedDocument } from '@shared/contracts'

export type NativeOpenedDocument = OpenedDocument

export const normalizeOpenedDocument = (
  opened: NativeOpenedDocument | null,
): OpenedDocument | null => opened

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
