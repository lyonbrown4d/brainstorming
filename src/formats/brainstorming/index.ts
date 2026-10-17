import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocumentAsset, MindMapWorkbook } from '@core/types'
import { NativeDocuments } from '@main/document-db'
import type { NativeReadOptions } from '@main/document-db'
import { storedMetadata } from '@main/document-db/types'
import { validateAssetContent } from '@formats/brainstorming/assets'

const MAX_TOOL_BYTES = 64 * 1024 * 1024

/** Bounded fixture/tool adapter. Production file paths use NativeDocuments directly. */
export const encodeBrainstorming = async (
  workbook: MindMapWorkbook,
  options: NativeReadOptions = {},
): Promise<Uint8Array> => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-encode-'))
  const path = join(directory, 'document.brainstorming')
  const native = new NativeDocuments()
  try {
    validateAssetContent(workbook)
    await native.write(path, workbook, options)
    await native.release(path)
    const bytes = await readFile(path)
    if (bytes.length > MAX_TOOL_BYTES)
      throw new Error('内存工具文档超过 64 MiB 限制，请使用文件路径接口')
    return bytes
  } finally {
    await native.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

export const decodeBrainstorming = async (
  bytes: Uint8Array,
  options: NativeReadOptions = {},
): Promise<MindMapWorkbook> => {
  if (bytes.length > MAX_TOOL_BYTES)
    throw new Error('内存工具文档超过 64 MiB 限制，请使用文件路径接口')
  if (bytes[0] === 80 && bytes[1] === 75) throw new Error('不支持旧 ZIP 文档；需要 SQLite 原生文档')
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-decode-'))
  const path = join(directory, 'document.brainstorming')
  const native = new NativeDocuments()
  try {
    await writeFile(path, bytes)
    const workbook = await native.read(path, options)
    const sheets = []
    for (const sheet of workbook.sheets) {
      if (!sheet.document.assets) {
        sheets.push(sheet)
        continue
      }
      const assets: Record<string, DocumentAsset> = {}
      for (const asset of Object.values(sheet.document.assets)) {
        const storage = storedMetadata(asset)
        if (!storage) {
          assets[asset.id] = asset
          continue
        }
        const chunks = []
        for await (const chunk of native.readObject(path, storage.objectId, options))
          chunks.push(chunk)
        assets[asset.id] = {
          id: asset.id,
          name: asset.name,
          mimeType: asset.mimeType,
          data: Buffer.concat(chunks).toString('base64'),
        }
      }
      sheets.push({ ...sheet, document: { ...sheet.document, assets } })
    }
    const hydrated = { ...workbook, sheets }
    validateAssetContent(hydrated)
    return hydrated
  } finally {
    await native.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}
