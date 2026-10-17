import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { NativeResourcePackage } from '@main/document-db/types'

export const fileObject = async (path: string): Promise<NativeResourcePackage> => {
  const info = await stat(path)
  if (!info.isFile() || info.size > 64 * 1024 ** 3) throw new Error('资源必须是 64 GiB 以内的文件')
  const size = info.size
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes as Buffer)
  return { objectId: hash.digest('hex'), byteLength: size, read: () => createReadStream(path) }
}
