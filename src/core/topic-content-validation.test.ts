import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  MAX_ASSET_BYTES,
  MAX_TOPIC_NOTES_LENGTH,
  validateDocument,
  validateDocumentAsset,
} from './index'
import type { DocumentAsset, MindMapDocument } from './index'

const asset: DocumentAsset = {
  id: 'file',
  name: 'file.bin',
  mimeType: 'application/octet-stream',
  data: 'AA==',
}

function zeroData(bytes: number): string {
  return 'AAAA'.repeat(Math.floor(bytes / 3)) + (['', 'AA==', 'AAA='][bytes % 3] ?? '')
}

function documentWith(
  content: Record<string, unknown>,
  assets: unknown = { file: asset },
): unknown {
  const document = createDocument()
  return { ...document, assets, topics: { root: { ...document.topics.root, ...content } } }
}

describe('topic content validation boundaries', () => {
  it.each([
    { id: '../file' },
    { id: '__proto__' },
    { id: '' },
    { id: 'a'.repeat(129) },
    { name: '' },
    { name: ' ' },
    { name: 'a'.repeat(256) },
    { name: 'a/b' },
    { name: 'a\\b' },
    { name: 'a\u0000b' },
    { name: 'a\nb' },
    { name: 'a\u0085b' },
    { mimeType: 'Image/PNG' },
    { mimeType: 'text' },
    { mimeType: 'text/plain; charset=utf-8' },
    { data: 'A===' },
    { data: 'AA' },
    { data: 'AB==' },
    { data: 'AAB=' },
    { data: 'AAAA\n' },
    { data: '____' },
    { data: 'data:;base64,AA==' },
  ])('rejects malformed assets: %j', (fields) => {
    expect(() => {
      validateDocumentAsset({ ...asset, ...fields })
    }).toThrow()
  })

  it('accepts empty bytes and the 8 MiB boundary, rejects an oversized resource and catches mutations', () => {
    expect(() => {
      validateDocumentAsset({ ...asset, data: '' })
    }).not.toThrow()
    expect(() => {
      validateDocumentAsset({ ...asset, data: zeroData(MAX_ASSET_BYTES) })
    }).not.toThrow()
    expect(() => {
      validateDocumentAsset({ ...asset, data: zeroData(MAX_ASSET_BYTES + 1) })
    }).toThrow()
    const mutable = { ...asset }
    validateDocumentAsset(mutable)
    mutable.data = 'AB=='
    expect(() => {
      validateDocumentAsset(mutable)
    }).toThrow()
  })

  it.each([
    { notes: 1 },
    { notes: 'a'.repeat(MAX_TOPIC_NOTES_LENGTH + 1) },
    { image: { assetId: 'missing', width: 1, height: 1 } },
    { image: { assetId: 'file', width: 1, height: 1 } },
    { image: { assetId: 'file', width: 0, height: 1 } },
    { image: { assetId: 'file', width: 1.5, height: 1 } },
    { image: { assetId: 'file', width: 8193, height: 1 } },
    { image: { assetId: 'file', width: 8192, height: 8192 } },
    { image: { assetId: 'file', width: 1, height: Number.NaN } },
    { attachments: ['missing'] },
    { attachments: ['file', 'file'] },
    { attachments: 'file' },
    { attachments: Array.from({ length: 33 }, (_, i) => `file-${i}`) },
  ])('rejects invalid topic content: %j', (content) => {
    expect(() => {
      validateDocument(documentWith(content))
    }).toThrow()
  })

  it('rejects mismatched asset indices, invalid asset collections, and SVG topic images', () => {
    for (const assets of [[], null, { wrong: asset }])
      expect(() => {
        validateDocument(documentWith({}, assets))
      }).toThrow()
    expect(() => {
      validateDocument(
        documentWith(
          { image: { assetId: 'file', width: 1, height: 1 } },
          { file: { ...asset, mimeType: 'image/svg+xml' } },
        ),
      )
    }).toThrow()
    for (const mimeType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
      expect(() => {
        validateDocument(
          documentWith(
            { image: { assetId: 'file', width: 8192, height: 1 } },
            { file: { ...asset, mimeType } },
          ),
        )
      }).not.toThrow()
  })

  it('limits decoded referenced bytes, deduplicates shared references, and ignores retained unused bytes', () => {
    const data = zeroData(MAX_ASSET_BYTES)
    const assets = Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((id) => [id, { ...asset, id, data }]),
    )
    const atLimit = documentWith({ attachments: ['a', 'b', 'c'] }, assets) as MindMapDocument
    validateDocument(atLimit)
    expect(() => {
      validateDocument(documentWith({ attachments: ['a', 'b', 'c', 'd'] }, assets))
    }).toThrow()
    expect(() =>
      applyCommand(atLimit, {
        type: 'addTopicAttachment',
        topicId: 'root',
        asset: { ...asset, id: 'extra' },
      }),
    ).toThrow()
    const shared = applyCommand(atLimit, {
      type: 'addTopic',
      parentId: 'root',
      id: 'child',
      title: '子主题',
    })
    const sharedAsset = assets.a
    if (!sharedAsset) throw new Error('Fixture 缺少资源')
    expect(() =>
      applyCommand(shared, {
        type: 'addTopicAttachment',
        topicId: 'child',
        asset: sharedAsset,
      }),
    ).not.toThrow()
  })

  it('enforces command limits before mutating notes or attachment lists', () => {
    const original = createDocument()
    expect(
      applyCommand(original, {
        type: 'setTopicNotes',
        topicId: 'root',
        notes: 'a'.repeat(MAX_TOPIC_NOTES_LENGTH),
      }).topics.root?.notes,
    ).toHaveLength(MAX_TOPIC_NOTES_LENGTH)
    expect(() =>
      applyCommand(original, {
        type: 'setTopicNotes',
        topicId: 'root',
        notes: 'a'.repeat(MAX_TOPIC_NOTES_LENGTH + 1),
      }),
    ).toThrow()
    let document = original
    for (let i = 0; i < 32; i += 1)
      document = applyCommand(document, {
        type: 'addTopicAttachment',
        topicId: 'root',
        asset: { ...asset, id: `file-${i}` },
      })
    expect(() =>
      applyCommand(document, {
        type: 'addTopicAttachment',
        topicId: 'root',
        asset: { ...asset, id: 'extra' },
      }),
    ).toThrow()
    expect(document.topics.root?.attachments).toHaveLength(32)
    expect(document.assets).not.toHaveProperty('extra')
    expect(original.topics.root).not.toHaveProperty('notes')
  })
})
