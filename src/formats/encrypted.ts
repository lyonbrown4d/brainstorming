import type { MindMapWorkbook } from '@core'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming'
import { validateFilePassword } from '@shared/fileSecurity'

const SQLITE_HEADER = new TextEncoder().encode('SQLite format 3\0')
/** Header-only classification. Authentication and document validation happen when opening SQLite. */
export const isEncryptedBrainstorming = (bytes: Uint8Array): Promise<boolean> => {
  if (bytes[0] === 80 && bytes[1] === 75) return Promise.reject(new Error('不支持旧 ZIP 原生文档'))
  if (/^\s*\{\s*"format"\s*:/u.test(new TextDecoder().decode(bytes.subarray(0, 128))))
    return Promise.reject(new Error('不支持旧 JSON 原生文档'))
  if (bytes.length < SQLITE_HEADER.length)
    return Promise.reject(new Error('Brainstorming 文件不完整'))
  return Promise.resolve(!SQLITE_HEADER.every((byte, index) => bytes[index] === byte))
}

/** Bounded fixture/tool adapter; production encryption uses NativeDocuments.rekey on its file path. */
export const encryptBrainstorming = async (
  workbook: MindMapWorkbook,
  password: string,
  passwordPolicy: 'new' | 'existing' = 'new',
): Promise<Uint8Array> => {
  validateFilePassword(password, passwordPolicy === 'new')
  return encodeBrainstorming(workbook, { password })
}
export const decryptBrainstorming = async (
  bytes: Uint8Array,
  password: string,
): Promise<MindMapWorkbook> => {
  validateFilePassword(password, false)
  if (!(await isEncryptedBrainstorming(bytes))) throw new Error('文件未加密')
  try {
    return await decodeBrainstorming(bytes, { password })
  } catch (cause) {
    throw new Error('密码错误或加密文件损坏，请重试', { cause })
  }
}
