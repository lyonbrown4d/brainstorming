import { decodeTrelyx, encodeTrelyx } from './trelyx'
import { importXmind } from './xmind'
import type { DecodedFile } from './types'

export { encodeTrelyx, decodeTrelyx } from './trelyx'
export type { DecodedFile, ImportedWorkbook } from './types'

export function decodeFile(bytes: Uint8Array, filename: string): DecodedFile {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，无法打开')
  // Some browser download APIs expose extensionless temporary paths. Identify native
  // archives by manifest in that case; XMind always requires its explicit extension.
  const extension = filename.split('.').at(-1)?.toLowerCase()
  if (extension === 'xmind') {
    const result = importXmind(bytes)
    // Reject an imported model that cannot be saved by the current native writer.
    encodeTrelyx(result.workbook)
    return { ...result, imported: true }
  }
  return { workbook: decodeTrelyx(bytes), warnings: [], imported: false }
}
