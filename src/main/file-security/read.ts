import { open } from 'node:fs/promises'
export const MAX_FILE_BYTES = 32 * 1024 * 1024
export const readDocumentBytes = async (path: string): Promise<Uint8Array> => {
  const handle = await open(path, 'r')
  try {
    if ((await handle.stat()).size > MAX_FILE_BYTES) throw new Error('文件超过 32 MiB')
    const chunks: Buffer[] = []
    let size = 0
    const stream = handle.createReadStream({ start: 0, end: MAX_FILE_BYTES, autoClose: false })
    for await (const chunk of stream) {
      const bytes = chunk as Buffer
      size += bytes.length
      if (size > MAX_FILE_BYTES) throw new Error('文件超过 32 MiB')
      chunks.push(bytes)
    }
    return Buffer.concat(chunks)
  } finally {
    await handle.close()
  }
}
