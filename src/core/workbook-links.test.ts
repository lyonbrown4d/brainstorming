import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createWorkbook,
  validateWorkbook,
  type MindMapWorkbook,
} from '@core'

const fixture = (): MindMapWorkbook => {
  const first = createWorkbook(createDocument('First', 'first'))
  const second = applyCommand(createDocument('Second', 'second'), {
    type: 'addTopic',
    parentId: 'root',
    id: 'target',
    title: 'Target',
  })
  const workbook = applyWorkbookCommand(first, {
    type: 'addSheet',
    sheet: { id: 'second', name: 'Second', document: second },
  })
  const firstDocument = applyCommand(workbook.sheets[0]?.document ?? createDocument(), {
    type: 'setTopicMetadata',
    topicId: 'root',
    metadata: { link: { kind: 'topic', topicId: 'target', sheetId: 'second' }, labels: ['retain'] },
  })
  return applyWorkbookCommand(workbook, {
    type: 'updateSheet',
    sheetId: 'first',
    document: firstDocument,
  })
}

describe('cross-sheet topic links', () => {
  it('validates cross-sheet target existence after all sheets are available', () => {
    const workbook = fixture()
    validateWorkbook(workbook)
    const first = workbook.sheets[0]
    if (!first) throw new Error('Missing fixture')
    for (const link of [
      { kind: 'topic' as const, sheetId: 'missing', topicId: 'root' },
      { kind: 'topic' as const, sheetId: 'second', topicId: 'missing' },
    ]) {
      const document = applyCommand(first.document, {
        type: 'setTopicMetadata',
        topicId: 'root',
        metadata: { link },
      })
      expect(() =>
        applyWorkbookCommand(workbook, { type: 'updateSheet', sheetId: 'first', document }),
      ).toThrow(/链接/)
    }
    expect(workbook.sheets[0]?.document.topics.root?.metadata?.link).toEqual({
      kind: 'topic',
      topicId: 'target',
      sheetId: 'second',
    })
  })

  it('removes links to a deleted sheet or removed target topic while preserving other metadata', () => {
    const workbook = fixture()
    const deletedSheet = applyWorkbookCommand(workbook, { type: 'deleteSheet', sheetId: 'second' })
    expect(deletedSheet.sheets[0]?.document.topics.root?.metadata).toEqual({ labels: ['retain'] })
    const second = workbook.sheets[1]
    if (!second) throw new Error('Missing fixture')
    const document = applyCommand(second.document, { type: 'deleteTopic', topicId: 'target' })
    const removedTopic = applyWorkbookCommand(workbook, {
      type: 'updateSheet',
      sheetId: 'second',
      document,
    })
    expect(removedTopic.sheets[0]?.document.topics.root?.metadata).toEqual({ labels: ['retain'] })
    validateWorkbook(removedTopic)
  })

  it('remaps explicit self-sheet links on duplication and preserves references to other sheets', () => {
    const workbook = fixture()
    const first = workbook.sheets[0]
    if (!first) throw new Error('Missing fixture')
    const document = applyCommand(first.document, {
      type: 'batch',
      commands: [
        { type: 'addTopic', parentId: 'root', id: 'self', title: 'Self' },
        {
          type: 'setTopicMetadata',
          topicId: 'self',
          metadata: { link: { kind: 'topic', sheetId: 'first', topicId: 'root' } },
        },
      ],
    })
    const original = applyWorkbookCommand(workbook, {
      type: 'updateSheet',
      sheetId: 'first',
      document,
    })
    const result = applyWorkbookCommand(original, {
      type: 'duplicateSheet',
      sheetId: 'first',
      id: 'copy',
    })
    const copy = result.sheets[1]?.document
    expect(copy?.topics.self?.metadata?.link).toEqual({
      kind: 'topic',
      sheetId: 'copy',
      topicId: 'root',
    })
    expect(copy?.topics.root?.metadata?.link).toEqual({
      kind: 'topic',
      sheetId: 'second',
      topicId: 'target',
    })
    expect(original.sheets[0]?.document.topics.self?.metadata?.link).toEqual({
      kind: 'topic',
      sheetId: 'first',
      topicId: 'root',
    })
  })
})
