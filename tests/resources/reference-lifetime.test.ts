import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { NativeDocuments } from '@main/document-db'
import { ResourceLibrary } from '@main/resources/library'

it('saving a removed resource never replaces its undo source with a document lacking its bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-resource-undo-'))
  const native = new NativeDocuments()
  const library = new ResourceLibrary(directory, native)
  try {
    const path = join(directory, 'original.bin')
    const bytes = Buffer.from('Retain this original for undo')
    await writeFile(path, bytes)
    const asset = await library.importFile(path)
    if (!asset.storage) throw new Error('Expected stored resource')
    const attached = applyCommand(createDocument(), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset,
    })
    const pruned = createWorkbook(
      applyCommand(attached, {
        type: 'removeTopicAttachment',
        topicId: 'root',
        assetId: asset.id,
      }),
    )
    const sheet = pruned.sheets[0]
    if (!sheet) throw new Error('Missing sheet')
    // Tool/import callers can retain unused descriptors; they are valid metadata, not persisted objects.
    const removed = {
      ...pruned,
      sheets: [
        {
          ...sheet,
          document: {
            ...sheet.document,
            assets: { [asset.id]: asset },
          },
        },
      ],
    }
    expect(removed.sheets[0]?.document.assets[asset.id]).toEqual(asset)
    const packages = await library.packagesFor(removed)
    expect(packages).toEqual([])
    const saved = join(directory, 'removed.brainstorming')
    await native.write(saved, removed, { resources: packages, source: library })
    library.register(removed, saved)
    expect(library.source(asset.storage.objectId).path).not.toBe(saved)
    const chunks = []
    for await (const chunk of library.readObject(asset.storage.objectId)) chunks.push(chunk)
    expect(Buffer.concat(chunks)).toEqual(bytes)
    expect((await native.read(saved)).sheets[0]?.document.assets).toEqual({})
  } finally {
    await library.dispose()
    await native.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
