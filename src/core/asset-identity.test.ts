import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument, type DocumentAsset } from '@core'

const asset = {
  id: 'stored',
  name: 'stored.bin',
  mimeType: 'application/octet-stream',
  storage: {
    objectId: 'a'.repeat(64),
    byteLength: 12,
    preview: {
      objectId: 'b'.repeat(64),
      byteLength: 4,
      mimeType: 'image/png',
      width: 2,
      height: 2,
    },
  },
} satisfies DocumentAsset
const original = () =>
  applyCommand(createDocument(), { type: 'addTopicAttachment', topicId: 'root', asset })

describe('stored resource identity', () => {
  it('rejects reusing an existing resource ID for a different stored object without changing the document', () => {
    const document = original()
    const replacement = { ...asset, storage: { ...asset.storage, objectId: 'c'.repeat(64) } }
    expect(() =>
      applyCommand(document, { type: 'addTopicAttachment', topicId: 'root', asset: replacement }),
    ).toThrow('资源 ID 已被其他内容占用')
    expect(document.assets?.stored?.storage?.objectId).toBe(asset.storage.objectId)
    expect(document.topics.root?.attachments).toEqual(['stored'])
  })

  it('accepts an equal stored descriptor even when reconstructed with a different property order', () => {
    const document = original()
    const same = {
      ...asset,
      storage: {
        preview: { ...asset.storage.preview },
        byteLength: 12,
        objectId: asset.storage.objectId,
      },
    }
    const repeated = applyCommand(document, {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: same,
    })
    expect(repeated).toBe(document)
    expect(repeated.topics.root?.attachments).toEqual(['stored'])
  })
})
