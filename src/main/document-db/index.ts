import { writeDocument } from '@main/document-db/write'
import { compactDocument } from '@main/document-db/compact'
import type { MindMapWorkbook } from '@core/types'
import { NativeDocumentPools } from '@main/document-db/pool'
import { readWorkbook, type StructuralRows } from '@main/document-db/read'
import { objectChunks, RESOURCE_CHUNK_BYTES } from '@main/document-db/resources'
import type {
  NativeResourcePackage,
  NativeRangeOptions,
  NativeReadOptions,
  NativeWriteOptions,
} from '@main/document-db/types'
export type * from '@main/document-db/types'

export class NativeDocuments {
  private readonly pools: NativeDocumentPools
  constructor(options: { readonly idleTimeoutMillis?: number } = {}) {
    this.pools = new NativeDocumentPools(options.idleTimeoutMillis)
  }

  read = async (path: string, options: NativeReadOptions = {}): Promise<MindMapWorkbook> => {
    return this.pools.withDatabase(path, options.password, false, async (db) => {
      await db.exec('BEGIN')
      try {
        const workbook = await readWorkbook(db)
        await db.exec('COMMIT')
        return workbook
      } catch (error) {
        await db.exec('ROLLBACK')
        throw error
      }
    })
  }

  write = (
    path: string,
    workbook: MindMapWorkbook,
    options: NativeWriteOptions = {},
  ): Promise<void> => writeDocument(this.pools, path, workbook, options)

  readObject = (
    path: string,
    objectId: string,
    options: NativeRangeOptions = {},
  ): AsyncIterable<Uint8Array> => {
    let offset = options.offset ?? 0
    let remaining = options.length ?? Number.MAX_SAFE_INTEGER
    let ended = false
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<Uint8Array>> => {
          if (ended || remaining <= 0) return { done: true, value: undefined }
          const length = Math.min(remaining, RESOURCE_CHUNK_BYTES)
          const chunks = await this.pools.withDatabase(path, options.password, false, (db) =>
            objectChunks(db, objectId, offset, length),
          )
          const bytes = Buffer.concat(chunks)
          offset += bytes.length
          remaining -= bytes.length
          ended = bytes.length < length
          return bytes.length ? { done: false, value: bytes } : { done: true, value: undefined }
        },
      }),
    }
  }

  objectInfo = async (
    path: string,
    objectId: string,
    options: NativeReadOptions = {},
  ): Promise<{ byteLength: number } | undefined> => {
    return this.pools.withDatabase(path, options.password, false, async (db) => {
      const row = (await db
        .prepare('SELECT byte_length FROM resource_objects WHERE id = ?')
        .get(objectId)) as { byte_length: number } | undefined
      return row ? { byteLength: row.byte_length } : undefined
    })
  }

  imageTile = async (
    path: string,
    objectId: string,
    level: number,
    x: number,
    y: number,
    options: NativeReadOptions = {},
  ): Promise<string | undefined> => {
    return this.pools.withDatabase(path, options.password, false, async (db) => {
      const row = (await db
        .prepare(
          'SELECT tile_object_id FROM image_tiles WHERE object_id = ? AND level = ? AND x = ? AND y = ?',
        )
        .get(objectId, level, x, y)) as { tile_object_id: string } | undefined
      return row?.tile_object_id
    })
  }

  listRevisions = async (
    path: string,
    options: NativeReadOptions = {},
  ): Promise<readonly { id: string; createdAt: string }[]> => {
    return this.pools.withDatabase(path, options.password, false, async (db) => {
      const rows = (await db
        .prepare('SELECT id,created_at FROM document_revisions ORDER BY created_at DESC,rowid DESC')
        .all()) as { id: string; created_at: string }[]
      return rows.map((row) => ({ id: row.id, createdAt: row.created_at }))
    })
  }

  readRevision = async (
    path: string,
    revisionId: string,
    options: NativeReadOptions = {},
  ): Promise<MindMapWorkbook> => {
    return this.pools.withDatabase(path, options.password, false, async (db) => {
      const row = (await db
        .prepare('SELECT metadata FROM document_revisions WHERE id = ?')
        .get(revisionId)) as { metadata: string } | undefined
      if (!row) throw new Error('文档历史版本不存在')
      return readWorkbook(db, JSON.parse(row.metadata) as StructuralRows)
    })
  }

  listImageTiles = async (
    path: string,
    objectId: string,
    options: NativeReadOptions = {},
  ): Promise<readonly { level: number; x: number; y: number; objectId: string }[]> => {
    return this.pools.withDatabase(path, options.password, false, async (db) => {
      const rows = (await db
        .prepare(
          'SELECT level,x,y,tile_object_id FROM image_tiles WHERE object_id = ? ORDER BY level,x,y',
        )
        .all(objectId)) as { level: number; x: number; y: number; tile_object_id: string }[]
      return rows.map(({ level, x, y, tile_object_id }) => ({
        level,
        x,
        y,
        objectId: tile_object_id,
      }))
    })
  }

  resourcePackages = async (
    path: string,
    objectId: string,
    options: NativeReadOptions = {},
  ): Promise<readonly NativeResourcePackage[]> => {
    const description = await this.pools.withDatabase(path, options.password, false, async (db) => {
      const variants = (await db
        .prepare(
          'SELECT variant_object_id,mime_type,width,height FROM resource_variants WHERE object_id = ?',
        )
        .all(objectId)) as {
        variant_object_id: string
        mime_type: string
        width: number
        height: number
      }[]
      const tiles = (await db
        .prepare('SELECT level,x,y,tile_object_id FROM image_tiles WHERE object_id = ?')
        .all(objectId)) as { level: number; x: number; y: number; tile_object_id: string }[]
      const ids = new Set([
        objectId,
        ...variants.map((item) => item.variant_object_id),
        ...tiles.map((item) => item.tile_object_id),
      ])
      const objects = (await db.prepare('SELECT id,byte_length FROM resource_objects').all()) as {
        id: string
        byte_length: number
      }[]
      const sizes = objects.filter(({ id }) => ids.has(id))
      if (sizes.length !== ids.size) throw new Error('资源对象缺失，不能复制不完整的资源目录')
      return { variants, tiles, sizes }
    })
    const preview = description.variants[0]
    return description.sizes.map(({ id, byte_length }) => ({
      objectId: id,
      byteLength: byte_length,
      read: () => this.readObject(path, id, options),
      ...(id === objectId && preview
        ? {
            preview: {
              objectId: preview.variant_object_id,
              mimeType: preview.mime_type,
              width: preview.width,
              height: preview.height,
            },
          }
        : {}),
      ...(id === objectId
        ? {
            tiles: description.tiles.map(({ level, x, y, tile_object_id }) => ({
              level,
              x,
              y,
              objectId: tile_object_id,
            })),
          }
        : {}),
    }))
  }

  compact = async (
    path: string,
    options: NativeReadOptions & { readonly pinnedObjectIds?: readonly string[] } = {},
  ): Promise<{ removedObjects: number }> => {
    return this.pools.withDatabase(path, options.password, false, (db) =>
      compactDocument(db, options.pinnedObjectIds ?? []),
    )
  }

  rekey = async (
    path: string,
    previousPassword: string | null,
    password: string | null,
  ): Promise<void> => {
    await this.pools.withDatabase(path, previousPassword ?? undefined, false, (db) => {
      if (password) db.driver.pragma("cipher = 'sqlcipher'")
      db.driver.rekey(Buffer.from(password ?? ''))
    })
    await this.release(path)
  }

  release = async (path: string): Promise<void> => {
    await this.pools.release(path)
  }
  dispose = async (): Promise<void> => {
    await this.pools.dispose()
  }
}
