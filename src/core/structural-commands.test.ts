import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createHistory,
  executeCommand,
  redo,
  undo,
  validateDocument,
  type Command,
  type MindMapDocument,
} from './index'
import { extensionFixture } from './extension-test-fixture'

function fixture(): MindMapDocument {
  return applyCommand(extensionFixture(), {
    type: 'batch',
    commands: [
      { type: 'setSide', topicId: 'a', side: 'left' },
      { type: 'addTopic', parentId: 'a', id: 'child2', title: 'Child 2' },
      { type: 'addTopic', parentId: 'child', id: 'leaf', title: 'Leaf' },
      {
        type: 'setTopicMetadata',
        topicId: 'child2',
        metadata: {
          link: { kind: 'topic', topicId: 'b' },
          task: { done: false, dependencies: ['b'] },
        },
      },
      { type: 'upsertRelation', relation: { id: 'kept', from: 'child', to: 'b', title: '' } },
      { type: 'upsertCallout', callout: { id: 'removed-callout', topicId: 'a', text: 'A' } },
      {
        type: 'upsertGroup',
        group: { id: 'removed-group', kind: 'summary', topicIds: ['a'], title: 'A' },
      },
    ],
  })
}

describe('structural editing commands', () => {
  it('inserts a parent in the original sibling position and preserves the branch and references', () => {
    const document = fixture()
    const result = applyCommand(document, {
      type: 'insertParentTopic',
      topicId: 'a',
      id: 'parent',
      title: '新主题',
    })
    expect(result.topics.root?.children).toEqual(['parent', 'b', 'floating'])
    expect(result.topics.parent).toEqual({
      id: 'parent',
      title: '新主题',
      children: ['a'],
      collapsed: false,
      side: 'left',
    })
    for (const id of ['a', 'child', 'child2', 'leaf'])
      expect(result.topics[id]).toBe(document.topics[id])
    expect(result.relations).toBe(document.relations)
    expect(result.groups).toBe(document.groups)
    expect(result.callouts).toBe(document.callouts)
    expect(result.floatingPositions).toBe(document.floatingPositions)
    validateDocument(result)

    const nested = applyCommand(document, {
      type: 'insertParentTopic',
      topicId: 'child2',
      id: 'nested',
      title: '新主题',
    })
    expect(nested.topics.a?.children).toEqual(['child', 'nested'])
    expect(nested.topics.nested?.children).toEqual(['child2'])
    expect(nested.topics.nested?.side).toBe('left')
  })

  it('promotes ordered children and prunes annotations and metadata referring only to the removed topic', () => {
    const document = fixture()
    const result = applyCommand(document, { type: 'removeTopicOnly', topicId: 'a' })
    expect(result.topics.root?.children).toEqual(['child', 'child2', 'b', 'floating'])
    expect(result.topics.a).toBeUndefined()
    expect(result.topics.child?.children).toEqual(['leaf'])
    expect(result.topics.child?.side).toBe('left')
    expect(result.topics.child2?.side).toBe('left')
    expect(result.topics.leaf).toBe(document.topics.leaf)
    expect(result.relations?.map(({ id }) => id)).toEqual(['kept'])
    expect(result.groups).toEqual([
      { id: 'group', kind: 'boundary', topicIds: ['child'], title: 'Group' },
    ])
    expect(result.callouts).toEqual([{ id: 'callout', topicId: 'child', text: '说明' }])
    expect(result.presentation).toEqual([{ topicId: 'floating' }])
    expect(result.topics.child?.metadata).toEqual({ task: { done: false, dependencies: [] } })
    expect(result.topics.child2?.metadata).toEqual(document.topics.child2?.metadata)
    expect(result.floatingIds).toEqual(['floating'])
    validateDocument(result)
  })

  it('promotes nested children in place and removes a leaf without its siblings', () => {
    const result = applyCommand(fixture(), { type: 'removeTopicOnly', topicId: 'child' })
    expect(result.topics.a?.children).toEqual(['leaf', 'child2'])
    expect(result.topics.leaf?.side).toBe('left')
    const leafRemoved = applyCommand(result, { type: 'removeTopicOnly', topicId: 'leaf' })
    expect(leafRemoved.topics.a?.children).toEqual(['child2'])
    validateDocument(leafRemoved)
  })

  it.each<Command>([
    { type: 'insertParentTopic', topicId: 'a', id: 'parent', title: '新主题' },
    { type: 'removeTopicOnly', topicId: 'a' },
  ])('commits one reversible history step for %j', (command) => {
    const history = createHistory(fixture())
    const result = executeCommand(history, command)
    expect(result.past).toEqual([history.document])
    expect(undo(result).document).toBe(history.document)
    expect(redo(undo(result)).document).toBe(result.document)
  })

  it.each<Command>([
    { type: 'insertParentTopic', topicId: 'root', id: 'parent', title: '新主题' },
    { type: 'insertParentTopic', topicId: 'floating', id: 'parent', title: '新主题' },
    { type: 'insertParentTopic', topicId: 'a', id: 'b', title: '新主题' },
    { type: 'insertParentTopic', topicId: 'missing', id: 'parent', title: '新主题' },
    { type: 'removeTopicOnly', topicId: 'root' },
    { type: 'removeTopicOnly', topicId: 'floating' },
    { type: 'removeTopicOnly', topicId: 'missing' },
  ])('rejects invalid edits without mutating the original document: %j', (command) => {
    const document = fixture()
    const original = JSON.stringify(document)
    expect(() => applyCommand(document, command)).toThrow()
    expect(JSON.stringify(document)).toBe(original)
  })
})
