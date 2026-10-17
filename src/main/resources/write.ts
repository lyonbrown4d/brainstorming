import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

/** Node flushes and closes the sibling temporary file before replacing the destination. */
export const writeResourceFile = async (
  path: string,
  bytes: AsyncIterable<Uint8Array>,
): Promise<void> => {
  const temporary = join(dirname(path), `.brainstorming-${randomUUID()}.tmp`)
  try {
    await pipeline(
      Readable.from(bytes),
      createWriteStream(temporary, { flags: 'wx', mode: 0o600, flush: true }),
    )
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
