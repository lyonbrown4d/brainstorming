import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { createAsset } from '@assets'
import { NativeDocuments, type NativeResourcePackage } from '@main/document-db'

const objectPackage = (text: string): NativeResourcePackage => {
  const bytes = Buffer.from(text)
  return {
    objectId: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
    read: () => ({
      [Symbol.asyncIterator]: () => {
        let done = false
        return {
          next: () => {
            const result = done
              ? { done: true as const, value: undefined }
              : { done: false as const, value: bytes }
            done = true
            return Promise.resolve(result)
          },
        }
      },
    }),
  }
}

describe('explicit native compaction', () => {
  it('keeps historical and manually pinned objects while removing unreferenced bytes from an encrypted file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'native-compact-'))
    const path = join(directory, 'map.brainstorming')
    const native = new NativeDocuments()
    const options = { password: 'compact-password' }
    try {
      const base = createDocument('Compaction')
      const asset = createAsset(Buffer.from('Historical original'), 'history.bin', 'asset')
      const original = createWorkbook(
        applyCommand(base, { type: 'addTopicAttachment', topicId: 'root', asset }),
      )
      await native.write(path, original, options)
      const revision = (await native.listRevisions(path, options))[0]
      if (!revision) throw new Error('Missing revision')
      const stored = await native.read(path, options)
      const historical = stored.sheets[0]?.document.assets?.asset?.storage
      if (!historical) throw new Error('Missing stored asset')
      const pinned = objectPackage('Pinned by unsaved undo state')
      const orphan = objectPackage('Unreferenced bytes')
      const blank = createWorkbook(base)
      await native.write(path, blank, { ...options, resources: [pinned, orphan] })
      expect(
        await native.compact(path, { ...options, pinnedObjectIds: [pinned.objectId] }),
      ).toEqual({ removedObjects: 1 })
      expect(await native.objectInfo(path, orphan.objectId, options)).toBeUndefined()
      expect(await native.objectInfo(path, pinned.objectId, options)).toEqual({
        byteLength: pinned.byteLength,
      })
      expect(await native.readRevision(path, revision.id, options)).toEqual(stored)
      const chunks = []
      for await (const chunk of native.readObject(path, historical.objectId, options))
        chunks.push(chunk)
      expect(Buffer.concat(chunks).toString()).toBe('Historical original')
      expect(await native.compact(path, options)).toEqual({ removedObjects: 1 })
      expect(await native.read(path, options)).toEqual(blank)
      expect((await readFile(path)).includes(Buffer.from('Historical original'))).toBe(false)
    } finally {
      await native.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
