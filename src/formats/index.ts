import { decodeTrelyx } from './trelyx'
import { importXmind } from './xmind'
import type { DecodedFile } from './types'

export { encodeTrelyx, decodeTrelyx } from './trelyx'
export type { DecodedFile, ImportedWorkbook } from './types'

export function decodeFile(bytes: Uint8Array, filename: string): DecodedFile {
  if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('文件超过 32 MB，无法打开')
  // Some browser download APIs expose extensionless temporary paths. Identify native
  // archives by manifest in that case; XMind always requires its explicit extension.
  const extension = filename.split('.').at(-1)?.toLowerCase()
  if (extension === 'xmind') {
    const result = importXmind(bytes)
    return { ...result, imported: true }
  }
  return { workbook: decodeTrelyx(bytes), warnings: [], imported: false }
}
