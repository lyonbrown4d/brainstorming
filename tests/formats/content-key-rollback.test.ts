import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { createAsset } from '@assets'
import { NativeDocuments } from '@main/document-db'

describe('failed key rotation content rollback', () => {
  it('preserves the original workbook, resources and full history when rekey fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'native-key-rollback-'))
    const path = join(directory, 'protected.brainstorming')
    const native = new NativeDocuments()
    const oldPassword = 'existing-password'
    const newPassword = 'replacement-password'
    const oldAsset = createAsset(Buffer.from('Original binary content'), 'original.bin', 'original')
    const original = createWorkbook(
      applyCommand(createDocument('Original', 'rollback-document'), {
        type: 'addTopicAttachment',
        topicId: 'root',
        asset: oldAsset,
      }),
    )
    try {
      for (let index = 0; index < 20; index++)
        await native.write(
          path,
          { ...original, title: `Saved ${index}` },
          { password: oldPassword },
        )
      const before = await native.read(path, { password: oldPassword })
      const history = await native.listRevisions(path, { password: oldPassword })
      expect(history).toHaveLength(20)
      const asset = before.sheets[0]?.document.assets?.original
      if (!asset?.storage) throw new Error('Missing original object')
      const changed = { ...original, title: 'Rejected edited content' }
      const driver = Database.prototype as Database.Database & {
        rekey: (password: Buffer) => number
      }
      const failure = new Error('injected cipher rekey failure')
      vi.spyOn(driver, 'rekey').mockImplementationOnce(() => {
        throw failure
      })
      await expect(
        native.write(path, changed, { existingPassword: oldPassword, password: newPassword }),
      ).rejects.toBe(failure)
      vi.restoreAllMocks()
      expect(await native.read(path, { password: oldPassword })).toEqual(before)
      expect(await native.listRevisions(path, { password: oldPassword })).toEqual(history)
      for (const revision of [history[0], history.at(-1)]) {
        if (!revision) throw new Error('Missing history revision')
        expect(
          (await native.readRevision(path, revision.id, { password: oldPassword })).sheets,
        ).toEqual(before.sheets)
      }
      const chunks = []
      for await (const chunk of native.readObject(path, asset.storage.objectId, {
        password: oldPassword,
      }))
        chunks.push(chunk)
      expect(Buffer.concat(chunks).toString()).toBe('Original binary content')
      await expect(native.read(path, { password: newPassword })).rejects.toThrow()
    } finally {
      vi.restoreAllMocks()
      await native.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
