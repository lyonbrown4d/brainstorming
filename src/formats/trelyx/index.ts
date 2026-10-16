import { strToU8, zipSync } from 'fflate'
import type { MindMapWorkbook } from '../../core/types'
import { documentData } from '../../core/document'
import { ARCHIVE_LIMITS, readArchive } from '../archive'
import { nativeWorkbook, onlyKeys, record, validateBoundedWorkbook } from './validation'

const manifest = {
  format: 'app.trelyx.document',
  version: 1,
  createdBy: { name: 'Trelyx', version: '0.1.0' },
} as const

function jsonBytes(value: unknown): Uint8Array {
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

function parseJson(bytes: Uint8Array | undefined, name: string): unknown {
  if (!bytes) throw new Error(`Trelyx 文件缺少 ${name}`)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch (cause) {
    throw new Error(`Trelyx ${name} 不是有效的 UTF-8 JSON`, { cause })
  }
}

export function encodeTrelyx(workbook: MindMapWorkbook): Uint8Array {
  validateBoundedWorkbook(workbook)
  const content = {
    id: workbook.id,
    title: workbook.title,
    sheets: workbook.sheets.map((sheet) => {
      const { id, title, rootId, topics } = documentData(sheet.document)
      return { id: sheet.id, name: sheet.name, document: { id, title, rootId, topics } }
    }),
  }
  const archive = zipSync(
    { 'manifest.json': jsonBytes(manifest), 'document.json': jsonBytes(content) },
    { level: 6 },
  )
  if (archive.length > ARCHIVE_LIMITS.compressed) throw new Error('Trelyx 文件超过 20 MiB 限制')
  return archive
}

export function decodeTrelyx(bytes: Uint8Array): MindMapWorkbook {
  const entries = readArchive(bytes)
  const metadata = record(parseJson(entries.get('manifest.json'), 'manifest.json'))
  if (metadata.format !== manifest.format) throw new Error('文件不是 Trelyx 原生文档')
  if (metadata.version !== manifest.version) throw new Error('不支持此 Trelyx 原生文档版本')
  onlyKeys(metadata, ['format', 'version', 'createdBy'])
  const createdBy = record(metadata.createdBy)
  onlyKeys(createdBy, ['name', 'version'])
  if (typeof createdBy.name !== 'string' || typeof createdBy.version !== 'string')
    throw new Error('Trelyx manifest.json 创建信息无效')
  for (const [name, data] of entries) {
    if (name === 'manifest.json' || name === 'document.json') continue
    if ((name === 'assets/' || name === 'preview/') && data.length === 0) continue
    throw new Error(`当前版本不支持 Trelyx 附加内容：${name}`)
  }
  return nativeWorkbook(parseJson(entries.get('document.json'), 'document.json'))
}
