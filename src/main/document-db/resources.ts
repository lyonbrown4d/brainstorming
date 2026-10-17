import { createHash } from 'node:crypto'
import type { NativeConnection } from '@main/document-db/connection'
import type { MindMapWorkbook } from '@core/types'
import { assetBytes } from '@assets'
import { referencedAssetIds } from '@core/topic-content'
import {
  storedMetadata,
  type NativeWriteOptions,
  type StoredAssetMetadata,
} from '@main/document-db/types'
import type { NativeRow } from '@main/document-db/rows'

export const RESOURCE_CHUNK_BYTES = 256 * 1024
export const assertObjectId = (id: string): void => {
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('资源对象标识必须为 SHA-256')
}

const insertObject = async (
  db: NativeConnection,
  objectId: string,
  byteLength: number,
  source: AsyncIterable<Uint8Array>,
): Promise<void> => {
  assertObjectId(objectId)
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error('资源字节数无效')
  const existing = (await db
    .prepare('SELECT byte_length FROM resource_objects WHERE id = ?')
    .get(objectId)) as { byte_length: number } | undefined
  if (existing) {
    if (existing.byte_length !== byteLength) throw new Error('资源对象长度不一致')
    return
  }
  const hash = createHash('sha256')
  const statement = db.prepare(
    'INSERT INTO resource_chunks (object_id,position,data,sha256) VALUES (?,?,?,?)',
  )
  const insert = {
    run: async (id: string, position: number, bytes: Buffer): Promise<void> => {
      await statement.run(id, position, bytes, createHash('sha256').update(bytes).digest('hex'))
    },
  }
  let bytes = 0
  let position = 0
  let pending = Buffer.alloc(0)
  for await (const chunk of source) {
    bytes += chunk.byteLength
    if (bytes > byteLength) throw new Error('资源对象长度超出声明')
    hash.update(chunk)
    let remaining = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    if (pending.length) {
      const take = Math.min(RESOURCE_CHUNK_BYTES - pending.length, remaining.length)
      pending = Buffer.concat([pending, remaining.subarray(0, take)])
      remaining = remaining.subarray(take)
      if (pending.length === RESOURCE_CHUNK_BYTES) {
        await insert.run(objectId, position++, pending)
        pending = Buffer.alloc(0)
      }
    }
    while (remaining.length >= RESOURCE_CHUNK_BYTES) {
      await insert.run(objectId, position++, remaining.subarray(0, RESOURCE_CHUNK_BYTES))
      remaining = remaining.subarray(RESOURCE_CHUNK_BYTES)
    }
    if (remaining.length) pending = Buffer.from(remaining)
  }
  if (pending.length) await insert.run(objectId, position, pending)
  if (bytes !== byteLength || hash.digest('hex') !== objectId)
    throw new Error('资源对象长度或 SHA-256 校验失败')
  await db
    .prepare('INSERT INTO resource_objects (id,byte_length) VALUES (?,?)')
    .run(objectId, byteLength)
}

const singleChunk = (bytes: Uint8Array): AsyncIterable<Uint8Array> => {
  let done = false
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        if (done) return Promise.resolve({ done: true as const, value: undefined })
        done = true
        return Promise.resolve({ done: false as const, value: bytes })
      },
    }),
  }
}

export const writeResources = async (
  db: NativeConnection,
  workbook: MindMapWorkbook,
  options: NativeWriteOptions,
): Promise<NativeRow[]> => {
  const rows: NativeRow[] = []
  const packages = new Map(options.resources?.map((item) => [item.objectId, item]))
  for (const item of packages.values())
    await insertObject(db, item.objectId, item.byteLength, item.read())
  for (const sheet of workbook.sheets) {
    for (const id of referencedAssetIds(sheet.document.topics)) {
      const asset = sheet.document.assets?.[id]
      if (!asset) throw new Error('主题引用的资源不存在')
      let storage = storedMetadata(asset)
      if (!storage) {
        const bytes = assetBytes(asset)
        storage = {
          objectId: createHash('sha256').update(bytes).digest('hex'),
          byteLength: bytes.length,
        }
        await insertObject(db, storage.objectId, storage.byteLength, singleChunk(bytes))
      } else {
        assertObjectId(storage.objectId)
        const exists = await db
          .prepare('SELECT byte_length FROM resource_objects WHERE id = ?')
          .get(storage.objectId)
        if (exists && (exists as { byte_length: number }).byte_length !== storage.byteLength)
          throw new Error('资源对象长度不一致')
        if (!exists) {
          if (!options.source) throw new Error('资源对象来源不可用')
          await insertObject(
            db,
            storage.objectId,
            storage.byteLength,
            options.source.readObject(storage.objectId),
          )
        }
      }
      const related = [storage.preview?.objectId]
      for (const relatedId of related) {
        if (
          !relatedId ||
          (await db.prepare('SELECT id FROM resource_objects WHERE id = ?').get(relatedId))
        )
          continue
        if (!options.source || !storage.preview) throw new Error('图片预览资源来源不可用')
        await insertObject(
          db,
          relatedId,
          storage.preview.byteLength,
          options.source.readObject(relatedId),
        )
      }
      if (storage.preview)
        await db
          .prepare('INSERT OR IGNORE INTO resource_variants VALUES (?,?,?,?,?,?)')
          .run(
            storage.objectId,
            'preview',
            storage.preview.objectId,
            storage.preview.mimeType,
            storage.preview.width,
            storage.preview.height,
          )
      rows.push({
        sheet_id: sheet.id,
        id,
        object_id: storage.objectId,
        name: asset.name,
        mime_type: asset.mimeType,
        metadata: JSON.stringify(storage),
      })
    }
  }
  for (const item of packages.values()) {
    if (item.preview)
      await db
        .prepare('INSERT OR REPLACE INTO resource_variants VALUES (?,?,?,?,?,?)')
        .run(
          item.objectId,
          'preview',
          item.preview.objectId,
          item.preview.mimeType,
          item.preview.width,
          item.preview.height,
        )
    for (const tile of item.tiles ?? [])
      await db
        .prepare('INSERT OR REPLACE INTO image_tiles VALUES (?,?,?,?,?)')
        .run(item.objectId, tile.level, tile.x, tile.y, tile.objectId)
  }
  return rows
}

export const objectChunks = async (
  db: NativeConnection,
  id: string,
  offset = 0,
  length?: number,
): Promise<Uint8Array[]> => {
  assertObjectId(id)
  const object = (await db
    .prepare('SELECT byte_length FROM resource_objects WHERE id = ?')
    .get(id)) as { byte_length: number } | undefined
  if (!object) throw new Error('资源对象不存在')
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    (length !== undefined && (!Number.isSafeInteger(length) || length < 0))
  )
    throw new Error('资源范围无效')
  const end = Math.min(object.byte_length, offset + (length ?? object.byte_length))
  if (end <= offset) return []
  const startChunk = Math.floor(offset / RESOURCE_CHUNK_BYTES)
  const endChunk = Math.floor((end - 1) / RESOURCE_CHUNK_BYTES)
  const chunks = (await db
    .prepare(
      `SELECT position,CASE WHEN typeof(data) = 'blob' THEN substr(data,1,?) ELSE NULL END AS data,length(data) AS stored_length,substr(sha256,1,65) AS sha256,length(sha256) AS checksum_length FROM resource_chunks WHERE object_id = ? AND position BETWEEN ? AND ? ORDER BY position`,
    )
    .all(RESOURCE_CHUNK_BYTES + 1, id, startChunk, endChunk)) as {
    position: number
    data: Buffer | null
    stored_length: number
    sha256: string
    checksum_length: number
  }[]
  if (chunks.length !== endChunk - startChunk + 1) throw new Error('资源对象分块缺失')
  for (const chunk of chunks) {
    const expected = Math.min(
      RESOURCE_CHUNK_BYTES,
      object.byte_length - chunk.position * RESOURCE_CHUNK_BYTES,
    )
    if (
      !Buffer.isBuffer(chunk.data) ||
      chunk.stored_length !== expected ||
      chunk.data.length !== expected ||
      chunk.checksum_length !== 64 ||
      createHash('sha256').update(chunk.data).digest('hex') !== chunk.sha256
    )
      throw new Error('资源分块校验失败', {
        cause: { storedBytes: chunk.stored_length, readBytes: chunk.data?.byteLength ?? 0 },
      })
  }
  return chunks.map(({ position, data }) => {
    if (!data) throw new Error('资源分块缺失')
    return new Uint8Array(
      data.subarray(
        Math.max(0, offset - position * RESOURCE_CHUNK_BYTES),
        Math.min(data.length, end - position * RESOURCE_CHUNK_BYTES),
      ),
    )
  })
}

export const resourceStorage = (json: string): StoredAssetMetadata =>
  JSON.parse(json) as StoredAssetMetadata
