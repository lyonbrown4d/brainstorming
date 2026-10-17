import { realpathSync } from 'node:fs'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { createAsset } from '@assets'
import { NativeDocuments } from '@main/document-db'
import { ResourceCatalog } from '@main/resources/catalog'

let directory: string
let native: NativeDocuments
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catalog-identity-'))
  native = new NativeDocuments()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await native.dispose()
  await rm(directory, { recursive: true, force: true })
})
const fixture = async () => {
  const path = join(directory, 'original.brainstorming')
  const alias = join(directory, 'alias.brainstorming')
  const bytes = Buffer.from('canonical object bytes')
  const workbook = createWorkbook(
    applyCommand(createDocument('Alias'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: createAsset(bytes, 'content.bin', 'asset'),
    }),
  )
  await native.write(path, workbook)
  await symlink(path, alias)
  const stored = await native.read(alias)
  const asset = stored.sheets[0]?.document.assets?.asset
  if (!asset?.storage) throw new Error('Missing stored asset')
  return {
    path,
    alias,
    bytes,
    workbook,
    id: asset.storage.objectId,
    source: { path: alias, byteLength: bytes.length, mimeType: asset.mimeType },
  }
}
const readCatalogObject = async (catalog: ResourceCatalog, id: string): Promise<Buffer> => {
  const source = catalog.get(id)
  if (!source) throw new Error('Missing catalog source')
  const chunks = []
  for await (const chunk of native.readObject(
    source.path,
    id,
    source.password ? { password: source.password } : {},
  ))
    chunks.push(chunk)
  return Buffer.concat(chunks)
}

describe('canonical native resource identities', () => {
  it('updates alias-registered credentials when the original path is rekeyed', async () => {
    const item = await fixture()
    const catalog = new ResourceCatalog()
    catalog.set(item.id, item.source)
    expect(catalog.get(item.id)?.path).toBe(await realpath(item.path))
    await native.rekey(item.path, null, 'canonical-password')
    catalog.updatePassword(item.path, 'canonical-password')
    expect(catalog.get(item.id)?.password).toBe('canonical-password')
    expect(await readCatalogObject(catalog, item.id)).toEqual(item.bytes)
    await native.rekey(item.alias, 'canonical-password', null)
    catalog.updatePassword(item.alias, null)
    expect(catalog.get(item.id)?.password).toBeUndefined()
    expect(await readCatalogObject(catalog, item.id)).toEqual(item.bytes)
  })
  it('collapses aliases of one file and retires them through either spelling', async () => {
    const item = await fixture()
    const catalog = new ResourceCatalog()
    catalog.set(item.id, item.source)
    catalog.set(item.id, { ...item.source, path: item.path })
    expect(catalog.retirePath(item.alias)).toBe(false)
    const second = join(directory, 'second.brainstorming')
    await native.write(second, item.workbook)
    catalog.set(item.id, { ...item.source, path: second })
    expect(catalog.retirePath(item.path)).toBe(true)
    await native.release(item.path)
    await rm(item.alias)
    await rm(item.path)
    expect(catalog.get(item.id)?.path).toBe(await realpath(second))
    expect(await readCatalogObject(catalog, item.id)).toEqual(item.bytes)
  })
  it('resolves one path once per synchronous resource registration batch', async () => {
    const item = await fixture()
    const catalog = new ResourceCatalog()
    const resolver = vi.spyOn(realpathSync, 'native')
    for (let index = 0; index < 32; index++) catalog.set(`${item.id}-${index}`, item.source)
    expect(resolver).toHaveBeenCalledTimes(1)
    catalog.updatePassword(item.path, 'next-password')
    catalog.updatePassword(item.alias, 'final-password')
    expect(resolver).toHaveBeenCalledTimes(2)
    expect(catalog.get(`${item.id}-31`)?.password).toBe('final-password')
  })
})
