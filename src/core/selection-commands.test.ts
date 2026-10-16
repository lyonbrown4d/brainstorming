import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  executeCommand,
  normalizeTopicSelection,
  redo,
  undo,
  validateDocument,
} from './index'
import type { Command, MindMapDocument } from './index'

function fixture(): MindMapDocument {
  return applyCommand(createDocument('中心', 'selection'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'A', side: 'left' },
      { type: 'addTopic', parentId: 'a', id: 'child', title: 'Child' },
      { type: 'addTopic', parentId: 'root', id: 'b', title: 'B', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'c', title: 'C', side: 'right' },
    ],
  })
}

describe('atomic selection commands', () => {
  it('normalizes duplicates and nested selections into tree order, including hidden children', () => {
    const document = applyCommand(fixture(), { type: 'toggleCollapse', topicId: 'a' })
    expect(normalizeTopicSelection(document, ['c', 'child', 'a', 'c', 'b'])).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(normalizeTopicSelection(document, ['child', 'root'])).toEqual(['root'])
    expect(() => normalizeTopicSelection(document, ['missing'])).toThrow()
  })

  it('deletes selected subtrees as one undoable action', () => {
    const history = createHistory(fixture())
    const result = executeCommand(history, { type: 'deleteTopics', topicIds: ['b', 'child', 'a'] })
    expect(Object.keys(result.document.topics)).toEqual(['root', 'c'])
    expect(result.document.topics.root?.children).toEqual(['c'])
    expect(result.past).toHaveLength(1)
    expect(undo(result).document).toBe(history.document)
    expect(redo(undo(result)).document).toBe(result.document)
  })

  it('moves ordered roots together and derives directions for their entire subtrees', () => {
    const document = applyCommand(fixture(), { type: 'toggleCollapse', topicId: 'b' })
    const moved = applyCommand(document, {
      type: 'moveTopics',
      topicIds: ['c', 'a', 'child'],
      parentId: 'b',
      index: 0,
    })
    expect(moved.topics.root?.children).toEqual(['b'])
    expect(moved.topics.b?.children).toEqual(['a', 'c'])
    expect(moved.topics.b?.collapsed).toBe(false)
    expect(moved.topics.a?.side).toBe('right')
    expect(moved.topics.child?.side).toBe('right')
    validateDocument(moved)
    const reordered = applyCommand(fixture(), {
      type: 'moveTopics',
      topicIds: ['c', 'a'],
      parentId: 'root',
      index: 1,
    })
    expect(reordered.topics.root?.children).toEqual(['b', 'a', 'c'])
    const unchanged = applyCommand(fixture(), {
      type: 'moveTopics',
      topicIds: ['a', 'b'],
      parentId: 'root',
      index: 0,
    })
    expect(unchanged).toEqual(fixture())
  })

  it.each<Command>([
    { type: 'deleteTopics', topicIds: ['b', 'root'] },
    { type: 'deleteTopics', topicIds: ['a', 'missing'] },
    { type: 'moveTopics', topicIds: ['a', 'b'], parentId: 'child' },
    { type: 'moveTopics', topicIds: ['root'], parentId: 'b' },
    { type: 'moveTopics', topicIds: ['a', 'b'], parentId: 'root', index: 2 },
    { type: 'moveTopics', topicIds: ['a', 'c'], parentId: 'b', side: 'left' },
    {
      type: 'batch',
      commands: [
        { type: 'renameTopic', topicId: 'a', title: 'Changed' },
        { type: 'deleteTopic', topicId: 'root' },
      ],
    },
  ])('rejects the whole operation without mutating the source: %j', (command) => {
    const document = fixture()
    const original = JSON.stringify(document)
    expect(() => applyCommand(document, command)).toThrow()
    expect(JSON.stringify(document)).toBe(original)
  })

  it('records one history step for nested batches and preserves empty/no-op batches', () => {
    const history = createHistory(fixture())
    expect(executeCommand(history, { type: 'batch', commands: [] })).toBe(history)
    const result = executeCommand(history, {
      type: 'batch',
      commands: [
        { type: 'renameTopic', topicId: 'root', title: 'New title' },
        { type: 'batch', commands: [{ type: 'setTopicNotes', topicId: 'a', notes: 'Notes' }] },
      ],
    })
    expect(result.document.title).toBe('New title')
    expect(result.document.topics.a?.notes).toBe('Notes')
    expect(result.past).toEqual([history.document])
    expect(undo(result).document).toBe(history.document)
  })

  it('bounds nesting, command count, and cyclic batch objects without recursive overflow', () => {
    const document = fixture()
    let command: Command = { type: 'batch', commands: [] }
    for (let index = 0; index < 34; index += 1) command = { type: 'batch', commands: [command] }
    expect(() => applyCommand(document, command)).toThrow(/限制/)
    expect(() =>
      applyCommand(document, {
        type: 'batch',
        commands: Array.from({ length: 10_001 }, () => ({ type: 'deleteTopics', topicIds: [] })),
      }),
    ).toThrow(/限制/)
    const commands: Command[] = []
    const cyclic: Command = { type: 'batch', commands }
    commands.push(cyclic)
    expect(() => applyCommand(document, cyclic)).toThrow(/限制/)
  })
})
