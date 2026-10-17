import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsset } from '@assets'
import { FileSecuritySession, isEncryptedNativeFile } from '@main/file-security/session'
import { RecoveryWorkspaceService } from '@main/workspace-recovery/service'
import type { RecoveryEntry } from '@main/workspace-recovery/repository'
import {
  applyCommand,
  createDocument,
  createWorkbook,
  serializeWorkbook,
  type DocumentAsset,
} from '@core'
import { NativeDocuments } from '@main/document-db'
import { ResourceLibrary } from '@main/resources/library'

let directory: string
let native: NativeDocuments
let library: ResourceLibrary
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'resource-library-'))
  native = new NativeDocuments()
  library = new ResourceLibrary(directory, native)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await library.dispose()
  await native.dispose()
  await rm(directory, { recursive: true, force: true })
})
const withAttachment = (asset: DocumentAsset, id = 'document') =>
  createWorkbook(
    applyCommand(createDocument('Shared', id), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset,
    }),
  )
const bytesOf = async (id: string): Promise<Buffer> => {
  const chunks = []
  for await (const chunk of library.readObject(id)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

describe('native resource library', () => {
  it('retains alternative copies when a document with a shared object is retired', async () => {
    const input = join(directory, 'attachment.bin')
    const bytes = Buffer.from('shared object content')
    await writeFile(input, bytes)
    const asset = await library.importFile(input)
    if (!asset.storage) throw new Error('Expected stored asset')
    const first = join(directory, 'first.brainstorming')
    const second = join(directory, 'second.brainstorming')
    const book = withAttachment(asset)
    for (const path of [first, second]) {
      await native.write(path, book, {
        source: library,
        resources: await library.packagesFor(book),
      })
      library.register(book, path)
    }
    expect(library.source(asset.storage.objectId).path).toBe(await realpath(second))
    expect(library.retirePath(second)).toBe(true)
    await native.release(second)
    await rm(second)
    expect(library.source(asset.storage.objectId).path).toBe(await realpath(first))
    expect(await bytesOf(asset.storage.objectId)).toEqual(bytes)
    expect(library.source(asset.storage.objectId).mimeType).toBe('application/octet-stream')
  })

  it('does not poison later imports after a failed vault transaction', async () => {
    const first = join(directory, 'failed.bin')
    const second = join(directory, 'accepted.bin')
    await writeFile(first, Buffer.from('failed input'))
    await writeFile(second, Buffer.from('accepted input'))
    vi.spyOn(native, 'write').mockRejectedValueOnce(new Error('vault disk failure'))
    await expect(library.importFile(first)).rejects.toThrow('vault disk failure')
    const asset = await library.importFile(second)
    if (!asset.storage) throw new Error('Expected stored asset')
    expect(await bytesOf(asset.storage.objectId)).toEqual(Buffer.from('accepted input'))
    const source = library.source(asset.storage.objectId)
    const stored = await native.read(
      source.path,
      source.password ? { password: source.password } : {},
    )
    expect(Object.keys(stored.sheets[0]?.document.assets ?? {})).toEqual([asset.id])
  })

  it('copies stored originals, previews and tiles across Save As and source retirement', async () => {
    const input = join(directory, 'picture.png')
    await sharp({ create: { width: 600, height: 512, channels: 4, background: '#aabbcc80' } })
      .png()
      .toFile(input)
    const original = await readFile(input)
    const asset = await library.importFile(input, 'image')
    const storage = asset.storage
    if (!storage?.preview || !storage.tiles) throw new Error('Expected image derivatives')
    const base = createDocument('Image')
    const book = createWorkbook(
      applyCommand(base, {
        type: 'setTopicImage',
        topicId: 'root',
        asset,
        width: storage.width ?? 600,
        height: storage.height ?? 512,
      }),
    )
    const first = join(directory, 'image-one.brainstorming')
    const second = join(directory, 'image-two.brainstorming')
    await native.write(first, book, { source: library, resources: await library.packagesFor(book) })
    library.register(book, first)
    const loaded = await native.read(first)
    await native.write(second, loaded, {
      source: library,
      resources: await library.packagesFor(loaded),
    })
    library.register(loaded, second)
    expect(library.retirePath(first)).toBe(true)
    await native.release(first)
    await rm(first)
    const copiedPackages = await library.packagesFor(loaded)
    const tile = copiedPackages.find((item) => item.objectId === storage.objectId)?.tiles?.[0]
    if (!tile) throw new Error('Expected tile record')
    expect(await native.imageTile(second, storage.objectId, tile.level, tile.x, tile.y)).toBe(
      tile.objectId,
    )
    expect(await bytesOf(storage.objectId)).toEqual(original)
    expect(await sharp(await bytesOf(storage.preview.objectId)).metadata()).toMatchObject({
      format: 'webp',
    })
    expect(await sharp(await bytesOf(tile.objectId)).metadata()).toMatchObject({ format: 'webp' })
    expect(library.source(storage.objectId).mimeType).toBe('image/png')
  })
  it('retains the last live recovery copy and encrypts it when it becomes an orphan', async () => {
    let entries: readonly RecoveryEntry[] = []
    const index = {
      read: () => Promise.resolve(entries),
      replace: (next: readonly RecoveryEntry[]) => {
        entries = [...next]
        return Promise.resolve()
      },
    }
    const security = new FileSecuritySession(native, library)
    const workspace = new RecoveryWorkspaceService(directory, security, index, native, library)
    const bytes = Buffer.from('Last live recovery resource')
    const original = withAttachment(createAsset(bytes, 'live.bin', 'live'), 'live-recovery')
    try {
      await workspace.prepareWrite([serializeWorkbook(original)])()
      const entry = entries[0]
      if (!entry) throw new Error('Missing recovery entry')
      const path = join(directory, 'recovery-sqlite-v1', entry.fileName)
      const stored = await native.read(path)
      const id = stored.sheets[0]?.document.assets?.live?.storage?.objectId
      if (!id) throw new Error('Missing resource object')
      await workspace.prepareWrite([])()
      expect(entries).toEqual([])
      expect(await bytesOf(id)).toEqual(bytes)
      await workspace.protect(original.id, null, 'orphan-password')
      expect(await isEncryptedNativeFile(path)).toBe(true)
      expect(library.source(id).password).toBe('orphan-password')
      expect(await bytesOf(id)).toEqual(bytes)
      expect((await readFile(path)).includes(bytes)).toBe(false)
    } finally {
      security.dispose()
    }
  })
  it('rejects imports after disposal begins and shares one completed cleanup', async () => {
    const path = join(directory, 'late.bin')
    await writeFile(path, Buffer.from('late import'))
    const first = library.dispose()
    expect(library.dispose()).toBe(first)
    await expect(library.importFile(path)).rejects.toThrow('disposed')
    await first
    await expect(library.importFile(path)).rejects.toThrow('disposed')
  })
})
