import { strFromU8 } from 'fflate'

export const ARCHIVE_LIMITS = {
  compressed: 32 * 1024 * 1024,
  entries: 512,
  entry: 10 * 1024 * 1024,
  expanded: 64 * 1024 * 1024,
} as const

export interface ArchiveEntry {
  readonly name: string
  readonly crc: number
  readonly size: number
  readonly compressedSize: number
  readonly method: number
  readonly flags: number
  readonly offset: number
}

const invalid = (): never => {
  throw new Error('ZIP 文件损坏或使用不支持的 ZIP 扩展')
}

const assertPath = (name: string): void => {
  const parts = name.split('/')
  if (
    name.length === 0 ||
    name.startsWith('/') ||
    /^[a-z]:/iu.test(name) ||
    name.includes('\\') ||
    name.includes('\0') ||
    parts.some(
      (part, index) => part === '..' || part === '.' || (part === '' && index !== parts.length - 1),
    )
  )
    throw new Error('ZIP 包含不安全的文件路径')
}

/** Inspect bounded ZIP metadata before starting any decompression. ZIP64 is unsupported. */
export const archiveDirectory = (
  bytes: Uint8Array,
): {
  entries: readonly ArchiveEntry[]
  dataEnd: number
} => {
  if (bytes.length > ARCHIVE_LIMITS.compressed) throw new Error('ZIP 文件超过 32 MiB 限制')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (offset: number): number => view.getUint16(offset, true)
  const u32 = (offset: number): number => view.getUint32(offset, true)
  let end = bytes.length - 22
  const lowerBound = Math.max(0, end - 65535)
  for (; end >= lowerBound; end--) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break
  }
  if (end < lowerBound || u16(end + 4) !== 0 || u16(end + 6) !== 0) invalid()
  const count = u16(end + 10)
  if (count > ARCHIVE_LIMITS.entries) throw new Error('ZIP 文件条目超过 512 项限制')
  if (u16(end + 8) !== count) invalid()
  const directorySize = u32(end + 12)
  const directoryOffset = u32(end + 16)
  if (directoryOffset + directorySize !== end) invalid()
  let cursor = directoryOffset
  let expanded = 0
  const names = new Set<string>()
  const entries: ArchiveEntry[] = []
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) invalid()
    const flags = u16(cursor + 8)
    if ((flags & 0x2041) !== 0) throw new Error('不支持加密的 ZIP 文件')
    const method = u16(cursor + 10)
    if (method !== 0 && method !== 8) throw new Error('不支持此 ZIP 压缩方式')
    const size = u32(cursor + 24)
    const compressedSize = u32(cursor + 20)
    if (size > ARCHIVE_LIMITS.entry) throw new Error('ZIP 单个条目超过 10 MiB 限制')
    expanded += size
    if (expanded > ARCHIVE_LIMITS.expanded) throw new Error('ZIP 解压后超过 64 MiB 限制')
    const nameLength = u16(cursor + 28)
    const next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32)
    if (next > end || u16(cursor + 34) !== 0) invalid()
    const name = strFromU8(bytes.subarray(cursor + 46, cursor + 46 + nameLength), !(flags & 2048))
    assertPath(name)
    if (names.has(name)) throw new Error('ZIP 包含重复文件路径')
    names.add(name)
    entries.push({
      name,
      flags,
      method,
      size,
      compressedSize,
      crc: u32(cursor + 16),
      offset: u32(cursor + 42),
    })
    cursor = next
  }
  if (cursor !== end) invalid()
  // Contiguous local records prevent hidden entries, overlapping records and prepended data.
  cursor = 0
  for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
    if (entry.offset !== cursor || cursor + 30 > directoryOffset || u32(cursor) !== 0x04034b50)
      invalid()
    const nameLength = u16(cursor + 26)
    const dataOffset = cursor + 30 + nameLength + u16(cursor + 28)
    if (
      dataOffset > directoryOffset ||
      u16(cursor + 6) !== entry.flags ||
      u16(cursor + 8) !== entry.method
    )
      invalid()
    const name = strFromU8(
      bytes.subarray(cursor + 30, cursor + 30 + nameLength),
      !(entry.flags & 2048),
    )
    if (name !== entry.name) invalid()
    cursor = dataOffset + entry.compressedSize
    if (cursor > directoryOffset) invalid()
    if (entry.flags & 8) {
      if (cursor + 12 > directoryOffset) invalid()
      if (u32(cursor) === 0x08074b50) cursor += 4
      if (
        cursor + 12 > directoryOffset ||
        u32(cursor) !== entry.crc ||
        u32(cursor + 4) !== entry.compressedSize ||
        u32(cursor + 8) !== entry.size
      )
        invalid()
      cursor += 12
    } else if (
      u32(entry.offset + 14) !== entry.crc ||
      u32(entry.offset + 18) !== entry.compressedSize ||
      u32(entry.offset + 22) !== entry.size
    )
      invalid()
  }
  if (cursor !== directoryOffset) invalid()
  return { entries, dataEnd: directoryOffset }
}
