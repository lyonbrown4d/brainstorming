import { Unzip, UnzipInflate } from 'fflate'
import CRC32 from 'crc-32'
import { archiveDirectory, ARCHIVE_LIMITS } from '@formats/archive-directory'

export { ARCHIVE_LIMITS } from '@formats/archive-directory'

/** Read ZIP entries in bounded chunks without writing archive paths to disk. */
export const readArchive = (bytes: Uint8Array): Map<string, Uint8Array> => {
  const { entries: directory, dataEnd } = archiveDirectory(bytes)
  const expected = new Map(directory.map((entry) => [entry.name, entry]))
  const result = new Map<string, Uint8Array>()
  let expanded = 0
  const unzip = new Unzip((file) => {
    const metadata = expected.get(file.name)
    if (!metadata || result.has(file.name)) throw new Error('ZIP 条目与目录不一致')
    const chunks: Uint8Array[] = []
    let size = 0
    let crc = 0
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error('ZIP 文件解压失败', { cause: error })
      size += chunk.length
      expanded += chunk.length
      if (
        size > ARCHIVE_LIMITS.entry ||
        size > metadata.size ||
        expanded > ARCHIVE_LIMITS.expanded
      ) {
        file.terminate()
        throw new Error('ZIP 解压大小超过限制或与目录不一致')
      }
      crc = CRC32.buf(chunk, crc)
      chunks.push(chunk)
      if (final) {
        if (size !== metadata.size || crc >>> 0 !== metadata.crc)
          throw new Error('ZIP 文件完整性校验失败')
        const contents = new Uint8Array(size)
        let offset = 0
        for (const part of chunks) {
          contents.set(part, offset)
          offset += part.length
        }
        result.set(file.name, contents)
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  // Small compressed chunks bound the inflater's transient allocation even when metadata lies.
  // A central header completes unsigned data descriptors; its remaining metadata is already checked.
  const streamEnd = Math.min(bytes.length, dataEnd + 46)
  for (let offset = 0; offset < streamEnd; offset += 1024) {
    const next = Math.min(offset + 1024, streamEnd)
    unzip.push(bytes.subarray(offset, next), next >= streamEnd)
  }
  if (result.size !== directory.length) throw new Error('ZIP 文件不完整')
  return result
}
