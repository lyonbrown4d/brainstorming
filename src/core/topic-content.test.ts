import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createHistory,
  createWorkbook,
  deserializeDocument,
  deserializeWorkbook,
  executeCommand,
  redo,
  serializeDocument,
  serializeWorkbook,
  undo,
  validateDocument,
} from '@core'
import type { DocumentAsset, MindMapDocument } from '@core'

const image: DocumentAsset = { id: 'photo', name: '照片.png', mimeType: 'image/png', data: 'AA==' }
const attachment: DocumentAsset = {
  id: 'file',
  name: '资料.bin',
  mimeType: 'application/octet-stream',
  data: '/wABAg==',
}

const withImage = (document = createDocument()): MindMapDocument => {
  return applyCommand(document, {
    type: 'setTopicImage',
    topicId: 'root',
    asset: image,
    width: 640,
    height: 480,
  })
}

describe('topic notes, images and attachments', () => {
  it('sets multiline notes, preserves spacing, removes blank notes, and skips unchanged edits', () => {
    const original = createDocument()
    const noted = applyCommand(original, {
      type: 'setTopicNotes',
      topicId: 'root',
      notes: '  第一行\n第二行  ',
    })
    expect(noted.topics.root?.notes).toBe('  第一行\n第二行  ')
    expect(original.topics.root).not.toHaveProperty('notes')
    expect(
      applyCommand(noted, { type: 'setTopicNotes', topicId: 'root', notes: '  第一行\n第二行  ' }),
    ).toBe(noted)
    const cleared = applyCommand(noted, { type: 'setTopicNotes', topicId: 'root', notes: ' \n ' })
    expect(cleared.topics.root).not.toHaveProperty('notes')
    expect(applyCommand(cleared, { type: 'setTopicNotes', topicId: 'root', notes: '' })).toBe(
      cleared,
    )
  })

  it('replaces and removes images in one undo step while retaining previous asset bytes', () => {
    let history = createHistory(withImage())
    const original = history.document
    const replacement = { ...image, id: 'replacement', name: '替换.png', data: 'AQ==' }
    history = executeCommand(history, {
      type: 'setTopicImage',
      topicId: 'root',
      asset: replacement,
      width: 320,
      height: 240,
    })
    expect(history.past).toEqual([original])
    expect(history.document.assets).toEqual({ photo: image, replacement })
    expect(undo(history).document).toBe(original)
    expect(redo(undo(history)).document).toBe(history.document)
    const removed = executeCommand(history, { type: 'removeTopicImage', topicId: 'root' })
    expect(removed.document.topics.root).not.toHaveProperty('image')
    expect(removed.document.assets).toEqual(history.document.assets)
    expect(undo(removed).document).toBe(history.document)
    expect(serializeDocument(removed.document)).not.toContain('assets')
    expect(applyCommand(removed.document, { type: 'removeTopicImage', topicId: 'root' })).toBe(
      removed.document,
    )
  })

  it('round-trips notes, image dimensions, and arbitrary attachment bytes using explicit fields', () => {
    let document = withImage()
    document = applyCommand(document, {
      type: 'setTopicNotes',
      topicId: 'root',
      notes: '备注\n内容',
    })
    document = applyCommand(document, {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: attachment,
    })
    expect(
      applyCommand(document, { type: 'addTopicAttachment', topicId: 'root', asset: attachment }),
    ).toBe(document)
    const reopened = deserializeDocument(serializeDocument(document))
    expect(reopened).toEqual(document)
    expect(reopened.topics.root?.image).toEqual({ assetId: image.id, width: 640, height: 480 })
    expect(reopened.assets?.file?.data).toBe('/wABAg==')
    const foreign = JSON.parse(serializeDocument(document)) as Record<string, unknown>
    foreign.assets = { photo: { ...image, sourcePath: '/private/file' }, file: attachment }
    expect(deserializeDocument(JSON.stringify(foreign))).toEqual(document)
    const removed = applyCommand(document, {
      type: 'removeTopicAttachment',
      topicId: 'root',
      assetId: attachment.id,
    })
    expect(removed.topics.root).not.toHaveProperty('attachments')
    expect(removed.assets?.file).toEqual(attachment)
    expect(deserializeDocument(serializeDocument(removed)).assets).toEqual({ photo: image })
  })

  it('rejects conflicting asset IDs atomically and allows one asset to be shared', () => {
    const document = withImage()
    const shared = applyCommand(document, {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: image,
    })
    expect(shared.topics.root?.attachments).toEqual(['photo'])
    expect(Object.keys(shared.assets ?? {})).toEqual(['photo'])
    for (const asset of [
      { ...image, data: 'AQ==' },
      { ...image, name: 'different.png' },
      { ...image, mimeType: 'image/jpeg' },
    ]) {
      expect(() =>
        applyCommand(document, { type: 'addTopicAttachment', topicId: 'root', asset }),
      ).toThrow()
    }
    expect(document.topics.root).not.toHaveProperty('attachments')
  })

  it('deletes a branch, keeps history self-contained and preserves its content when duplicating sheets', () => {
    let document = applyCommand(createDocument('中心', 'first'), {
      type: 'addTopic',
      parentId: 'root',
      id: 'branch',
      title: '分支',
    })
    document = applyCommand(document, {
      type: 'addTopicAttachment',
      topicId: 'branch',
      asset: attachment,
    })
    document = applyCommand(document, {
      type: 'setTopicNotes',
      topicId: 'branch',
      notes: '分支备注',
    })
    document = withImage(document)
    const workbook = applyWorkbookCommand(createWorkbook(document), {
      type: 'duplicateSheet',
      sheetId: 'first',
      id: 'copy',
    })
    const copy = workbook.sheets[1]?.document
    expect(copy?.topics.branch?.attachments).toEqual(['file'])
    expect(copy?.topics.branch?.notes).toBe('分支备注')
    expect(copy?.assets?.file).toEqual(attachment)
    expect(copy?.assets?.file).not.toBe(document.assets?.file)
    expect(copy?.topics.root?.image).toEqual(document.topics.root?.image)
    expect(copy?.topics.root?.image).not.toBe(document.topics.root?.image)
    expect(copy?.topics.branch?.attachments).not.toBe(document.topics.branch?.attachments)
    expect(deserializeWorkbook(serializeWorkbook(workbook))).toEqual(workbook)
    const removed = executeCommand(createHistory(document), {
      type: 'deleteTopic',
      topicId: 'branch',
    })
    expect(removed.document.assets?.file).toEqual(attachment)
    expect(deserializeDocument(serializeDocument(removed.document)).assets).toEqual({
      photo: image,
    })
    expect(undo(removed).document).toBe(document)
    const updated = applyWorkbookCommand(workbook, {
      type: 'updateSheet',
      sheetId: 'first',
      document: removed.document,
    })
    expect(updated.sheets[0]?.document.assets?.file).toEqual(attachment)
  })

  it('canonicalizes blank notes and empty attachment lists without changing document versions', () => {
    const original = createDocument()
    const root = original.topics.root
    if (!root) throw new Error('Fixture 缺少中心主题')
    const document = {
      ...original,
      topics: { root: { ...root, notes: '  ', attachments: [] } },
      assets: { unused: { ...attachment, id: 'unused' } },
    }
    validateDocument(document)
    expect(deserializeDocument(serializeDocument(document))).toEqual(original)
    expect(createWorkbook(document).version).toBe(2)
  })

  it('deduplicates shared binary objects across duplicated sheets and rejects unique workbook overflow', () => {
    const assets: DocumentAsset[] = [1, 2, 3, 4].map((index) => ({
      id: `large-${index}`,
      name: `large-${index}.bin`,
      mimeType: 'application/octet-stream',
      storage: { objectId: String(index).repeat(64), byteLength: 64 * 1024 ** 3 },
    }))
    const document = applyCommand(createDocument('素材', 'first'), {
      type: 'batch',
      commands: assets.map((asset) => ({ type: 'addTopicAttachment', topicId: 'root', asset })),
    })
    let workbook = createWorkbook(document)
    for (const id of ['second', 'third', 'fourth'])
      workbook = applyWorkbookCommand(workbook, { type: 'duplicateSheet', sheetId: 'first', id })
    expect(workbook.sheets).toHaveLength(4)
    const original = assets[0]
    if (!original) throw new Error('Missing stored fixture')
    const alias = applyCommand(createDocument('Alias', 'alias'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: { ...original, id: 'different-resource-id' },
    })
    workbook = applyWorkbookCommand(workbook, {
      type: 'addSheet',
      sheet: { id: 'alias', name: 'Alias', document: alias },
    })
    expect(workbook.sheets).toHaveLength(5)
    const extra = applyCommand(createDocument('Extra', 'extra'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: {
        id: 'extra',
        name: 'extra.bin',
        mimeType: 'application/octet-stream',
        storage: { objectId: '5'.repeat(64), byteLength: 1 },
      },
    })
    expect(() =>
      applyWorkbookCommand(workbook, {
        type: 'addSheet',
        sheet: { id: 'extra', name: 'Extra', document: extra },
      }),
    ).toThrow('256 GiB')
    expect(workbook.sheets).toHaveLength(5)
  })
})
