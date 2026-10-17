import { strToU8, zipSync } from 'fflate'
import type { MindMapWorkbook } from '@core/types'
import { documentExtensionData } from '@core/extension-data'
import { documentData } from '@core/document'
import { ARCHIVE_LIMITS, readArchive } from '@formats/archive'
import { assertUsedAssets, encodeAssets, validateAssetContent } from '@formats/trelyx/assets'
import {
  nativeWorkbook,
  onlyKeys,
  record,
  validateBoundedWorkbook,
} from '@formats/trelyx/validation'

const manifest = {
  format: 'app.trelyx.document',
  version: 1,
  createdBy: { name: 'Trelyx', version: '0.1.0' },
} as const

const jsonBytes = (value: unknown): Uint8Array => {
  let characters = 0
  const json = JSON.stringify(value, (_key: string, item: unknown) => {
    if (typeof item === 'string') characters += item.length
    if (characters > ARCHIVE_LIMITS.entry) throw new Error('Trelyx 文档超过 10 MiB 限制')
    return item
  })
  if (json.length > ARCHIVE_LIMITS.entry) throw new Error('Trelyx 文档超过 10 MiB 限制')
  const bytes = strToU8(json)
  if (bytes.length > ARCHIVE_LIMITS.entry) throw new Error('Trelyx 文档超过 10 MiB 限制')
  return bytes
}

const parseJson = (bytes: Uint8Array | undefined, name: string): unknown => {
  if (!bytes) throw new Error(`Trelyx 文件缺少 ${name}`)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch (cause) {
    throw new Error(`Trelyx ${name} 不是有效的 UTF-8 JSON`, { cause })
  }
}

export const encodeTrelyx = (workbook: MindMapWorkbook): Uint8Array => {
  validateBoundedWorkbook(workbook)
  validateAssetContent(workbook)
  const entries: Record<string, Uint8Array> = {}
  const content = {
    id: workbook.id,
    title: workbook.title,
    sheets: workbook.sheets.map((sheet, index) => {
      const { id, title, rootId, topics } = documentData(sheet.document)
      const assets = encodeAssets(sheet.document, index, entries)
      return {
        id: sheet.id,
        name: sheet.name,
        document: {
          id,
          title,
          rootId,
          topics,
          ...documentExtensionData(sheet.document),
          ...(assets ? { assets } : {}),
        },
      }
    }),
  }
  if (Object.keys(entries).length + 2 > ARCHIVE_LIMITS.entries)
    throw new Error('Trelyx 文件条目超过 512 项限制')
  const archive = zipSync(
    { ...entries, 'manifest.json': jsonBytes(manifest), 'document.json': jsonBytes(content) },
    { level: 6 },
  )
  if (archive.length > ARCHIVE_LIMITS.compressed) throw new Error('Trelyx 文件超过 32 MiB 限制')
  return archive
}

export const decodeTrelyx = (bytes: Uint8Array): MindMapWorkbook => {
  const entries = readArchive(bytes)
  const metadata = record(parseJson(entries.get('manifest.json'), 'manifest.json'))
  if (metadata.format !== manifest.format) throw new Error('文件不是 Trelyx 原生文档')
  if (metadata.version !== manifest.version) throw new Error('不支持此 Trelyx 原生文档版本')
  onlyKeys(metadata, ['format', 'version', 'createdBy'])
  const createdBy = record(metadata.createdBy)
  onlyKeys(createdBy, ['name', 'version'])
  if (typeof createdBy.name !== 'string' || typeof createdBy.version !== 'string')
    throw new Error('Trelyx manifest.json 创建信息无效')
  const used = new Set(['manifest.json', 'document.json'])
  const workbook = nativeWorkbook(
    parseJson(entries.get('document.json'), 'document.json'),
    entries,
    used,
  )
  assertUsedAssets(workbook)
  validateAssetContent(workbook)
  for (const [name, data] of entries) {
    if (used.has(name)) continue
    if ((name === 'assets/' || name === 'preview/') && data.length === 0) continue
    throw new Error(`当前版本不支持 Trelyx 附加内容：${name}`)
  }
  return workbook
}
