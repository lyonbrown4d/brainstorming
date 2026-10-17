import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { createAsset } from '@assets'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming'
import { NativeDocuments } from '@main/document-db'
import { APPLICATION_ID } from '@main/document-db/schema'

const directories: string[] = []
const services: NativeDocuments[] = []
const setup = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-test-'))
  directories.push(directory)
  const service = new NativeDocuments({ idleTimeoutMillis: 20 })
  services.push(service)
  return { service, path: join(directory, 'map.brainstorming') }
}
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})
const workbook = () => {
  const document = applyCommand(createDocument('中文 🌱', 'document-one'), {
    type: 'addTopic',
    parentId: 'root',
    id: 'branch',
    title: '分支',
    side: 'left',
  })
  const original = createWorkbook(document, '工作簿')
  return {
    ...original,
    sheets: [
      ...original.sheets,
      { id: 'second', name: '第二页', document: createDocument('第二页', 'document-two') },
    ],
  }
}

describe('native SQLite documents', () => {
  it('creates an identified SQLite database with explicit migrations and roundtrips ordered sheets/topics', async () => {
    const original = workbook()
    const bytes = await encodeBrainstorming(original)
    expect(new TextDecoder().decode(bytes.subarray(0, 16))).toBe('SQLite format 3\0')
    expect(await decodeBrainstorming(bytes)).toEqual(original)
    const { path } = await setup()
    await writeFile(path, bytes)
    const db = new Database(path)
    expect(db.pragma('application_id', { simple: true })).toBe(APPLICATION_ID)
    expect(db.prepare('SELECT name FROM kysely_migration').all()).toHaveLength(1)
    expect(
      db.prepare("SELECT parent_id,position,data FROM topics WHERE id = 'branch'").get(),
    ).toMatchObject({ parent_id: 'root', position: 0 })
    expect(
      db
        .prepare('SELECT data FROM topics')
        .all()
        .every((row) => !(row as { data: string }).data.includes('"children"')),
    ).toBe(true)
    db.close()
  })

  it('rejects old ZIP, unrelated SQLite, newer protocols/features/migrations and damaged topic references', async () => {
    await expect(decodeBrainstorming(new Uint8Array([80, 75, 3, 4]))).rejects.toThrow(/ZIP/)
    for (const mutation of [
      'PRAGMA application_id = 1',
      'UPDATE document SET protocol = 999',
      `UPDATE document SET required_features = '["future-feature"]'`,
      `INSERT INTO kysely_migration VALUES ('999999_future','now')`,
      `UPDATE topics SET parent_id = 'missing' WHERE id = 'branch'`,
      `UPDATE topics SET data = '{"id":"root","title":"bad","children":[]}' WHERE id = 'root'`,
    ]) {
      const { path, service } = await setup()
      await writeFile(path, await encodeBrainstorming(workbook()))
      const db = new Database(path)
      db.exec(mutation)
      db.close()
      await expect(service.read(path)).rejects.toThrow()
    }
  })

  it('rolls back a failed save and preserves original bytes and previous content', async () => {
    const { path, service } = await setup()
    const original = workbook()
    await service.write(path, original)
    const before = await readFile(path)
    const asset = {
      id: 'missing',
      name: 'missing.bin',
      mimeType: 'application/octet-stream',
      storage: { objectId: 'a'.repeat(64), byteLength: 10 },
    }
    const sheet = original.sheets[0]
    if (!sheet) throw new Error('Missing fixture')
    const root = sheet.document.topics.root
    if (!root) throw new Error('Missing root')
    const changed = {
      ...original,
      sheets: [
        {
          ...sheet,
          document: {
            ...sheet.document,
            assets: { missing: asset },
            topics: { ...sheet.document.topics, root: { ...root, attachments: ['missing'] } },
          },
        },
      ],
    }
    await expect(service.write(path, changed)).rejects.toThrow(/来源/)
    expect(await service.read(path)).toEqual(original)
    expect(await readFile(path)).toEqual(before)
  })

  it('deduplicates immutable bytes across sheets/saves and streams bounded object ranges', async () => {
    const { path, service } = await setup()
    const bytes = new Uint8Array(700_000).fill(17)
    const asset = createAsset(bytes, 'binary.bin', 'asset')
    const document = applyCommand(createDocument('Resource'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset,
    })
    const original = createWorkbook(document)
    await service.write(path, original)
    const loaded = await service.read(path)
    const storage = loaded.sheets[0]?.document.assets?.asset?.storage
    if (!storage) throw new Error('Missing stored resource')
    const chunks = []
    for await (const chunk of service.readObject(path, storage.objectId, {
      offset: 250_000,
      length: 300_000,
    }))
      chunks.push(chunk)
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes.subarray(250_000, 550_000)))
    await service.write(path, { ...loaded, title: 'Renamed' })
    await service.release(path)
    const db = new Database(path)
    expect(db.prepare('SELECT count(*) AS count FROM resource_objects').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT count(*) AS count FROM document_revisions').get()).toEqual({
      count: 2,
    })
    db.close()
  })

  it('isolates documents/passwords, encrypts bytes and permits key rotation after idle cleanup', async () => {
    const { path, service } = await setup()
    const first = workbook()
    const second = join(path, '..', 'second.brainstorming')
    await service.write(path, first, { password: 'old-password' })
    await service.write(second, { ...first, title: 'Other' })
    expect(new TextDecoder().decode((await readFile(path)).subarray(0, 16))).not.toBe(
      'SQLite format 3\0',
    )
    await expect(service.read(path, { password: 'wrong' })).rejects.toThrow()
    expect((await service.read(second)).title).toBe('Other')
    await service.write(
      path,
      { ...first, title: 'Rotated' },
      { existingPassword: 'old-password', password: 'new-password' },
    )
    await expect(service.read(path, { password: 'old-password' })).rejects.toThrow()
    expect((await service.read(path, { password: 'new-password' })).title).toBe('Rotated')
    await service.release(path)
    expect((await service.read(path, { password: 'new-password' })).title).toBe('Rotated')
  })
  it('restores saved revision structure while reusing immutable objects', async () => {
    const { path, service } = await setup()
    const original = workbook()
    await service.write(path, original)
    const first = (await service.listRevisions(path))[0]
    if (!first) throw new Error('Missing revision')
    await service.write(path, {
      ...original,
      title: 'Changed',
      sheets: [...original.sheets].reverse(),
    })
    expect((await service.read(path)).title).toBe('Changed')
    expect(await service.readRevision(path, first.id)).toEqual(original)
  })

  it('enables and removes protection on an existing plaintext file', async () => {
    const { path, service } = await setup()
    const original = workbook()
    await service.write(path, original)
    await service.rekey(path, null, 'enabled-password')
    await expect(service.read(path)).rejects.toThrow()
    expect(await service.read(path, { password: 'enabled-password' })).toEqual(original)
    await service.rekey(path, 'enabled-password', null)
    expect(await service.listRevisions(path)).toHaveLength(1)
    expect(await service.read(path)).toEqual(original)
    expect(new TextDecoder().decode((await readFile(path)).subarray(0, 16))).toBe(
      'SQLite format 3\0',
    )
  })

  it('copies original, preview and tile packages to a new document without losing tile lookup', async () => {
    const { path, service } = await setup()
    const sourceBytes = [Buffer.from('original'), Buffer.from('preview'), Buffer.from('tile')]
    const packages = sourceBytes.map((bytes) => ({
      objectId: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.length,
      read: () => ({
        [Symbol.asyncIterator]: () => {
          let done = false
          return {
            next: () => {
              const value = done
                ? { done: true as const, value: undefined }
                : { done: false as const, value: bytes }
              done = true
              return Promise.resolve(value)
            },
          }
        },
      }),
    }))
    const [original, preview, tile] = packages
    if (!original || !preview || !tile) throw new Error('Missing package')
    const doc = createDocument('Tiles')
    const root = doc.topics.root
    if (!root) throw new Error('Missing root')
    const asset = {
      id: 'image',
      name: 'picture.png',
      mimeType: 'image/png',
      storage: {
        objectId: original.objectId,
        byteLength: original.byteLength,
        preview: {
          objectId: preview.objectId,
          byteLength: preview.byteLength,
          mimeType: 'image/webp',
          width: 10,
          height: 10,
        },
      },
    }
    const book = createWorkbook({
      ...doc,
      assets: { image: asset },
      topics: { root: { ...root, image: { assetId: 'image', width: 10, height: 10 } } },
    })
    await service.write(path, book, {
      resources: [
        {
          ...original,
          preview: { objectId: preview.objectId, mimeType: 'image/webp', width: 10, height: 10 },
          tiles: [{ objectId: tile.objectId, level: 0, x: 0, y: 0 }],
        },
        preview,
        tile,
      ],
    })
    const destination = join(path, '..', 'copy.brainstorming')
    await service.write(destination, await service.read(path), {
      resources: await service.resourcePackages(path, original.objectId),
    })
    expect(await service.imageTile(destination, original.objectId, 0, 0, 0)).toBe(tile.objectId)
    expect(await service.listImageTiles(destination, original.objectId)).toEqual([
      { objectId: tile.objectId, level: 0, x: 0, y: 0 },
    ])
    const copied = []
    for await (const chunk of service.readObject(destination, tile.objectId)) copied.push(chunk)
    expect(Buffer.concat(copied)).toEqual(Buffer.from('tile'))
    await service.release(path)
    const damaged = new Database(path)
    damaged.prepare('DELETE FROM resource_objects WHERE id = ?').run(tile.objectId)
    damaged.close()
    await expect(service.resourcePackages(path, original.objectId)).rejects.toThrow('资源对象缺失')
  })
})
