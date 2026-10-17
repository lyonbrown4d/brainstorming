import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { createAsset } from '@assets'
import { NativeDocuments } from '@main/document-db'
import { RESOURCE_CHUNK_BYTES } from '@main/document-db/resources'

it('bounds a corrupt oversized chunk before loading or hashing a one-byte range', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-chunk-boundary-'))
  const path = join(directory, 'corrupt.brainstorming')
  const native = new NativeDocuments()
  try {
    const asset = createAsset(Buffer.from('safe'), 'safe.bin', 'asset')
    const workbook = createWorkbook(
      applyCommand(createDocument('Range'), { type: 'addTopicAttachment', topicId: 'root', asset }),
    )
    await native.write(path, workbook)
    const stored = await native.read(path)
    const objectId = stored.sheets[0]?.document.assets?.asset?.storage?.objectId
    if (!objectId) throw new Error('Missing resource')
    await native.release(path)
    const database = new Database(path)
    try {
      database
        .prepare('UPDATE resource_chunks SET data = zeroblob(?) WHERE object_id = ?')
        .run(1024 * 1024, objectId)
    } finally {
      database.close()
    }
    const iterator = native
      .readObject(path, objectId, { offset: 0, length: 1 })
      [Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toMatchObject({
      message: '资源分块校验失败',
      cause: { storedBytes: 1024 * 1024, readBytes: RESOURCE_CHUNK_BYTES + 1 },
    })
  } finally {
    await native.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
