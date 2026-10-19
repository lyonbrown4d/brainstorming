import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  createTopicClipboard,
  deserializeDocument,
  executeCommand,
  serializeDocument,
  undo,
  validateDocument,
  validateTopicClipboard,
} from '@core'
import { summarySelectionRanges } from '@core/summary'

const source = () =>
  applyCommand(createDocument('Map', 'summary-fixture'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'A', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'b', title: 'B', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'c', title: 'C', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'summary-topic', title: 'Summary', side: 'right' },
      { type: 'addTopic', parentId: 'summary-topic', id: 'detail', title: 'Detail' },
      {
        type: 'upsertGroup',
        group: {
          id: 'summary',
          kind: 'summary',
          topicIds: ['a', 'b'],
          summaryTopicId: 'summary-topic',
        },
      },
    ],
  })

const requireGroup = (document: ReturnType<typeof source>) => {
  const group = document.groups?.[0]
  if (!group) throw new Error('Test summary group missing')
  return group
}

describe('real summary topics', () => {
  it('keeps descendants editable, serializable, and removable in one undo step', () => {
    const initial = source()
    const edited = applyCommand(initial, {
      type: 'addTopic',
      parentId: 'summary-topic',
      id: 'second-detail',
      title: 'More',
    })
    expect(edited.topics['summary-topic']?.children).toEqual(['detail', 'second-detail'])
    expect(deserializeDocument(serializeDocument(edited))).toEqual(edited)
    const removed = executeCommand(createHistory(edited), {
      type: 'removeGroup',
      groupId: 'summary',
    })
    expect(removed.document.topics['summary-topic']).toBeUndefined()
    expect(removed.document.topics.detail).toBeUndefined()
    expect(removed.document.topics.a).toBeDefined()
    expect(undo(removed).document).toBe(edited)
  })

  it('drops dangling links when source or linked topic is deleted', () => {
    const initial = source()
    const sourceRemoved = applyCommand(initial, { type: 'deleteTopics', topicIds: ['a', 'b'] })
    expect(sourceRemoved.groups).toEqual([])
    expect(sourceRemoved.topics['summary-topic']).toBeUndefined()
    expect(sourceRemoved.topics.detail).toBeUndefined()
    const topicRemoved = applyCommand(initial, { type: 'deleteTopic', topicId: 'summary-topic' })
    expect(topicRemoved.groups).toEqual([])
    expect(topicRemoved.topics.a).toBeDefined()
    validateDocument(sourceRemoved)
    validateDocument(topicRemoved)
  })

  it('copies the linked topic and descendants with the full source range', () => {
    const original = source()
    const clipboard = createTopicClipboard(original, ['a', 'b'])
    validateTopicClipboard(clipboard)
    expect(clipboard.roots).toEqual(['a', 'b', 'summary-topic'])
    const pasted = applyCommand(createDocument('Target', 'target'), {
      type: 'pasteTopics',
      parentId: 'root',
      clipboard,
      topicIds: { a: 'a2', b: 'b2', 'summary-topic': 's2', detail: 'd2' },
      assetIds: {},
    })
    expect(pasted.groups?.[0]).toMatchObject({
      topicIds: ['a2', 'b2'],
      summaryTopicId: 's2',
    })
    expect(pasted.topics.s2?.children).toEqual(['d2'])
  })

  it('accepts only consecutive source siblings on explicit scope changes', () => {
    const original = source()
    const group = requireGroup(original)
    expect(summarySelectionRanges(original, ['c', 'a', 'b'])).toEqual([['a', 'b', 'c']])
    expect(() => {
      applyCommand(original, {
        type: 'upsertGroup',
        group: { ...group, topicIds: ['a', 'c'] },
      })
    }).toThrow()
    const extended = applyCommand(original, {
      type: 'upsertGroup',
      group: { ...group, topicIds: ['a', 'b', 'c'] },
    })
    expect(extended.groups?.[0]?.topicIds).toEqual(['a', 'b', 'c'])
  })

  it('rejects crafted root, duplicate, and ancestor links before layout', () => {
    const original = source()
    const group = requireGroup(original)
    expect(() => {
      validateDocument({ ...original, groups: [{ ...group, summaryTopicId: 'root' }] })
    }).toThrow()
    expect(() => {
      validateDocument({
        ...original,
        groups: [group, { ...group, id: 'other' }],
      })
    }).toThrow()
    expect(() => {
      validateDocument({
        ...original,
        groups: [{ ...group, summaryTopicId: 'a' }],
      })
    }).toThrow()
  })

  it('keeps ordinary moves valid and unlinks a summary moved inside its source', () => {
    const initial = source()
    const movedSource = applyCommand(initial, {
      type: 'moveTopic',
      topicId: 'a',
      parentId: 'c',
    })
    expect(movedSource.groups?.[0]?.summaryTopicId).toBe('summary-topic')
    const movedSummary = applyCommand(initial, {
      type: 'moveTopic',
      topicId: 'summary-topic',
      parentId: 'a',
    })
    expect(movedSummary.groups?.[0]?.summaryTopicId).toBeUndefined()
    expect(movedSummary.topics.a?.children).toContain('summary-topic')
  })
})
