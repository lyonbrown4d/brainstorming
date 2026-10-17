import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  createTopicClipboard,
  executeCommand,
  undo,
  validateDocument,
  validateTopicClipboard,
} from '@core'
import type { Command, MindMapDocument } from '@core'

const fixture = (): MindMapDocument => {
  return applyCommand(createDocument('源文档', 'source'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'A', side: 'left' },
      { type: 'addTopic', parentId: 'a', id: 'child', title: '孩子' },
      { type: 'addTopic', parentId: 'root', id: 'b', title: 'B', side: 'right' },
      { type: 'setTopicNotes', topicId: 'child', notes: '备注' },
      { type: 'setTopicStyle', topicId: 'a', style: { bold: true, fill: '#ff0000' } },
      {
        type: 'setTopicImage',
        topicId: 'a',
        asset: { id: 'picture', name: 'pixel.png', mimeType: 'image/png', data: 'AP+A' },
        width: 1,
        height: 1,
      },
      {
        type: 'addTopicAttachment',
        topicId: 'child',
        asset: {
          id: 'binary',
          name: 'data.bin',
          mimeType: 'application/octet-stream',
          data: '/wABAA==',
        },
      },
    ],
  })
}

const pasteCommand = (document: MindMapDocument): Extract<Command, { type: 'pasteTopics' }> => {
  return {
    type: 'pasteTopics',
    parentId: 'root',
    clipboard: createTopicClipboard(document, ['child', 'a']),
    topicIds: { a: 'copy-a', child: 'copy-child' },
    assetIds: { picture: 'copy-picture', binary: 'copy-binary' },
  }
}

describe('subtree clipboard', () => {
  it('copies normalized roots with only referenced resources and isolated topic data', () => {
    const document = fixture()
    const clipboard = createTopicClipboard(document, ['child', 'b', 'a', 'a'])
    expect(clipboard.roots).toEqual(['a', 'b'])
    expect(Object.keys(clipboard.topics)).toEqual(['a', 'child', 'b'])
    expect(Object.keys(clipboard.assets ?? {})).toEqual(['picture', 'binary'])
    expect(clipboard.topics.a).not.toBe(document.topics.a)
    expect(clipboard.topics.a?.style).not.toBe(document.topics.a?.style)
    validateTopicClipboard(clipboard)
    expect(() => createTopicClipboard(document, [])).toThrow()
  })

  it('pastes across documents with complete remapping, embedded binary data and one undo step', () => {
    const source = fixture()
    const history = createHistory(createDocument('目标', 'target'))
    const result = executeCommand(history, pasteCommand(source))
    const document = result.document
    expect(document.topics.root?.children).toEqual(['copy-a'])
    expect(document.topics['copy-a']?.children).toEqual(['copy-child'])
    expect(document.topics['copy-child']?.notes).toBe('备注')
    expect(document.topics['copy-a']?.style).toEqual({ bold: true, fill: '#ff0000' })
    expect(document.topics['copy-a']?.image?.assetId).toBe('copy-picture')
    expect(document.topics['copy-child']?.attachments).toEqual(['copy-binary'])
    expect(document.assets?.['copy-binary']?.data).toBe('/wABAA==')
    expect(document.assets?.['copy-picture']?.data).toBe('AP+A')
    expect(result.past).toHaveLength(1)
    expect(undo(result).document).toBe(history.document)
    validateDocument(document)
  })

  it('copies the center topic and both sides, then inherits the target branch side', () => {
    const source = fixture()
    const clipboard = createTopicClipboard(source, ['root'])
    validateTopicClipboard(clipboard)
    const pasted = applyCommand(source, {
      type: 'pasteTopics',
      parentId: 'b',
      clipboard,
      topicIds: { root: 'whole', a: 'whole-a', child: 'whole-child', b: 'whole-b' },
      assetIds: { picture: 'whole-picture', binary: 'whole-binary' },
    })
    for (const id of ['whole', 'whole-a', 'whole-child', 'whole-b'])
      expect(pasted.topics[id]?.side).toBe('right')
    expect(pasted.topics.b?.children).toEqual(['whole'])
    validateDocument(pasted)
  })

  it('enforces pasted resource quotas on the final batch snapshot and preserves rollback', () => {
    const assetIds = ['one', 'two', 'three', 'four']
    const source = applyCommand(createDocument('Source', 'large-source'), {
      type: 'batch',
      commands: assetIds.map((id, index) => ({
        type: 'addTopicAttachment',
        topicId: 'root',
        asset: {
          id,
          name: `${id}.bin`,
          mimeType: 'application/octet-stream',
          storage: { objectId: String(index + 1).repeat(64), byteLength: 64 * 1024 ** 3 },
        },
      })),
    })
    const target = applyCommand(createDocument('Target', 'large-target'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: {
        id: 'existing',
        name: 'existing.bin',
        mimeType: 'application/octet-stream',
        data: 'AA==',
      },
    })
    const command: Command = {
      type: 'pasteTopics',
      parentId: 'root',
      clipboard: createTopicClipboard(source, ['root']),
      topicIds: { root: 'copy-root' },
      assetIds: { one: 'copy-one', two: 'copy-two', three: 'copy-three', four: 'copy-four' },
    }
    const history = createHistory(target)
    expect(() => executeCommand(history, command)).toThrow(/256 GiB/)
    expect(history.document).toBe(target)
    expect(history.past).toEqual([])
    const result = executeCommand(history, {
      type: 'batch',
      commands: [command, { type: 'removeTopicAttachment', topicId: 'root', assetId: 'existing' }],
    })
    expect(result.document.topics['copy-root']?.attachments).toEqual([
      'copy-one',
      'copy-two',
      'copy-three',
      'copy-four',
    ])
    expect(result.document.topics.root?.attachments).toBeUndefined()
    expect(result.past).toHaveLength(1)
  })

  it('rejects incomplete, duplicate, reserved or occupied mappings atomically', () => {
    const document = fixture()
    const base = pasteCommand(document)
    for (const command of [
      { ...base, topicIds: { a: 'new' } },
      { ...base, topicIds: { a: 'new', child: 'new' } },
      { ...base, topicIds: { a: '__proto__', child: 'new' } },
      { ...base, topicIds: { a: 'b', child: 'new' } },
      { ...base, assetIds: {} },
      { ...base, assetIds: { picture: 'picture', binary: 'new-binary' } },
      { ...base, assetIds: { picture: 'new-image', binary: 'new-image' } },
    ]) {
      const original = JSON.stringify(document)
      expect(() => applyCommand(document, command)).toThrow()
      expect(JSON.stringify(document)).toBe(original)
    }
  })

  it('rejects malformed clipboard trees and inherited records before changing the destination', () => {
    const clipboard = createTopicClipboard(fixture(), ['a'])
    const a = clipboard.topics.a
    if (!a) throw new Error('Missing fixture')
    for (const value of [
      { ...clipboard, roots: ['a', 'child'] },
      {
        ...clipboard,
        topics: { ...clipboard.topics, child: { ...clipboard.topics.child, children: ['a'] } },
      },
      { ...clipboard, roots: ['missing'] },
      { ...clipboard, topics: Object.create({ a }) as unknown },
      { ...clipboard, assets: {} },
    ])
      expect(() => {
        validateTopicClipboard(value)
      }).toThrow()
    const target = createDocument('目标', 'target')
    const original = JSON.stringify(target)
    const malicious = JSON.parse(
      '{"__proto__":{"id":"__proto__","title":"x","children":[],"side":"right","collapsed":false}}',
    ) as unknown
    expect(() => {
      validateTopicClipboard({ ...clipboard, topics: malicious })
    }).toThrow()
    expect(JSON.stringify(target)).toBe(original)
  })
})
