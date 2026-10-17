import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocument, createWorkbook } from '@core'
import { NativeDocuments } from '@main/document-db'

const invalidObject = () => ({
  objectId: createHash('sha256').update('good').digest('hex'),
  byteLength: 4,
  read: () => ({
    [Symbol.asyncIterator]: () => {
      let done = false
      return {
        next: () => {
          const result = done
            ? { done: true as const, value: undefined }
            : { done: false as const, value: Buffer.from('bad!') }
          done = true
          return Promise.resolve(result)
        },
      }
    },
  }),
})

describe('failed native creation cleanup', () => {
  it('removes a failed first write and permits a clean retry at the same path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'native-create-'))
    const path = join(directory, 'new.brainstorming')
    const native = new NativeDocuments()
    const workbook = createWorkbook(createDocument('Retry'))
    try {
      await expect(native.write(path, workbook, { resources: [invalidObject()] })).rejects.toThrow(
        'SHA-256',
      )
      await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
      await native.write(path, workbook)
      expect(await native.read(path)).toEqual(workbook)
    } finally {
      await native.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('preserves an already committed document when a subsequent write fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'native-preserve-'))
    const path = join(directory, 'existing.brainstorming')
    const native = new NativeDocuments()
    const workbook = createWorkbook(createDocument('Preserved'))
    try {
      await native.write(path, workbook)
      await expect(
        native.write(path, { ...workbook, title: 'Failed' }, { resources: [invalidObject()] }),
      ).rejects.toThrow('SHA-256')
      expect(await native.read(path)).toEqual(workbook)
    } finally {
      await native.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('never deletes a document committed by another queued first-save attempt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'native-concurrent-create-'))
    const path = join(directory, 'concurrent.brainstorming')
    const native = new NativeDocuments()
    const workbook = createWorkbook(createDocument('Committed first'))
    try {
      const results = await Promise.allSettled([
        native.write(path, workbook),
        native.write(
          path,
          { ...workbook, title: 'Rejected second' },
          { resources: [invalidObject()] },
        ),
      ])
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
      expect(await native.read(path)).toEqual(workbook)
    } finally {
      await native.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
