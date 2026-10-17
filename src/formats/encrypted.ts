import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  type Entry,
  type CreateReadableOptions,
} from '@zip.js/zip.js'
import { zipSync } from 'fflate'
import type { MindMapWorkbook } from '@core'
import { validateFilePassword } from '@shared/fileSecurity'
import { ARCHIVE_LIMITS, readArchive } from '@formats/archive'
import { decodeTrelyx, encodeTrelyx } from '@formats/trelyx'

class BoundedZipInput extends Uint8ArrayReader {
  override createReadable = (options?: CreateReadableOptions): ReadableStream<Uint8Array> => {
    return super.createReadable({ ...options, chunkSize: 1024 })
  }
}
const reader = (bytes: Uint8Array) => {
  if (bytes.length > ARCHIVE_LIMITS.compressed) throw new Error('文件超过 32 MiB')
  const input = new BoundedZipInput(bytes)
  return new ZipReader(input, {
    useWebWorkers: false,
    strictness: 'strict',
    checkCrc32: true,
    checkAuthenticationCode: true,
    checkOverlappingEntry: true,
  })
}
const validateEntry = (entry: Entry, names: Set<string>, budget: { size: number }): void => {
  const name = entry.filename
  if (
    !name ||
    name.length > 1024 ||
    name.startsWith('/') ||
    /^[a-z]:/iu.test(name) ||
    name.includes('\\') ||
    /[\p{Cc}]/u.test(name) ||
    name
      .split('/')
      .some(
        (part, index, parts) =>
          part === '.' || part === '..' || (!part && index !== parts.length - 1),
      )
  )
    throw new Error('加密 ZIP 包含不安全路径')
  if (names.has(name) || names.size >= ARCHIVE_LIMITS.entries)
    throw new Error('加密 ZIP 条目重复或超过限制')
  names.add(name)
  if (entry.directory && entry.uncompressedSize !== 0) throw new Error('ZIP 目录不能包含文件数据')
  if (
    entry.symlink ||
    entry.zip64 ||
    ![0, 8].includes(entry.compressionMethod) ||
    entry.uncompressedSize > ARCHIVE_LIMITS.entry ||
    entry.uncompressedSize < 0
  )
    throw new Error('加密 ZIP 条目格式或大小无效')
  budget.size += entry.uncompressedSize
  if (budget.size > ARCHIVE_LIMITS.expanded) throw new Error('加密 ZIP 解压大小超过限制')
  if (entry.encrypted && (entry.zipCrypto || entry.extraFieldAES?.strength !== 3))
    throw new Error('仅支持 AES-256 加密的 Trelyx 文件')
}
const entriesOf = async (zip: ReturnType<typeof reader>): Promise<Entry[]> => {
  const names = new Set<string>()
  const budget = { size: 0 }
  const result: Entry[] = []
  for await (const entry of zip.getEntriesGenerator()) {
    validateEntry(entry, names, budget)
    result.push(entry)
  }
  if (!names.has('manifest.json') || !names.has('document.json'))
    throw new Error('缺少 Trelyx 原生文档内容')
  return result
}
export const isEncryptedTrelyx = async (bytes: Uint8Array): Promise<boolean> => {
  const zip = reader(bytes)
  try {
    return (await entriesOf(zip)).some((entry) => entry.encrypted)
  } finally {
    await zip.close()
  }
}
export const encryptTrelyx = async (
  workbook: MindMapWorkbook,
  password: string,
  passwordPolicy: 'new' | 'existing' = 'new',
): Promise<Uint8Array> => {
  validateFilePassword(password, passwordPolicy === 'new')
  const zip = new ZipWriter(new Uint8ArrayWriter(), {
    password,
    encryptionStrength: 3,
    useWebWorkers: false,
    zip64: false,
    dataDescriptor: false,
    bufferedWrite: true,
  })
  for (const [name, bytes] of readArchive(encodeTrelyx(workbook)))
    await zip.add(name, new Uint8ArrayReader(bytes))
  const result = await zip.close()
  if (result.length > ARCHIVE_LIMITS.compressed) throw new Error('加密文件超过 32 MiB')
  return result
}
export const decryptTrelyx = async (
  bytes: Uint8Array,
  password: string,
): Promise<MindMapWorkbook> => {
  validateFilePassword(password, false)
  const zip = reader(bytes)
  try {
    const entries = await entriesOf(zip)
    if (entries.some((entry) => !entry.directory && !entry.encrypted))
      throw new Error('加密 Trelyx 文件含有未保护的条目')
    const output = Object.create(null) as Record<string, Uint8Array>
    let total = 0
    for (const entry of entries) {
      if (entry.directory) {
        output[entry.filename] = new Uint8Array()
        continue
      }
      const chunks: Uint8Array[] = []
      let size = 0
      const writable = new WritableStream<Uint8Array>({
        write: (chunk) => {
          size += chunk.length
          total += chunk.length
          if (
            size > entry.uncompressedSize ||
            size > ARCHIVE_LIMITS.entry ||
            total > ARCHIVE_LIMITS.expanded
          )
            throw new Error('加密 ZIP 解压大小超过限制')
          chunks.push(chunk.slice())
        },
      })
      await entry.getData<unknown>(
        { writable },
        { password, checkCrc32: true, checkAuthenticationCode: true, checkOverlappingEntry: true },
      )
      if (size !== entry.uncompressedSize) throw new Error('加密 ZIP 条目不完整')
      const data = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        data.set(chunk, offset)
        offset += chunk.length
      }
      output[entry.filename] = data
    }
    return decodeTrelyx(zipSync(output, { level: 6 }))
  } catch {
    throw new Error('密码错误或加密文件损坏，请重试')
  } finally {
    await zip.close()
  }
}
