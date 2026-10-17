import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  executeCommand,
  getParentId,
  getVisibleTopicIds,
  redo,
  undo,
  validateDocument,
} from '@core'
import type { Command, MindMapDocument } from '@core'

const branchDocument = (): MindMapDocument => {
  let document = createDocument('中心', 'test-document')
  const commands: Command[] = [
    { type: 'addTopic', parentId: 'root', id: 'a', title: 'A', side: 'left' },
    { type: 'addTopic', parentId: 'root', id: 'b', title: 'B', side: 'right' },
    { type: 'addTopic', parentId: 'a', id: 'a1', title: 'A1' },
    { type: 'addTopic', parentId: 'a1', id: 'a2', title: 'A2' },
  ]
  for (const command of commands) document = applyCommand(document, command)
  return document
}

describe('typed tree commands', () => {
  it('inserts in order, updates the root title, and keeps previous snapshots intact', () => {
    const before = branchDocument()
    const original = JSON.stringify(before)
    const document = applyCommand(before, {
      type: 'addTopic',
      parentId: 'root',
      id: 'c',
      title: 'C',
      index: 1,
    })
    expect(document.topics.root?.children).toEqual(['a', 'c', 'b'])
    expect(document.topics.a).toBe(before.topics.a)
    expect(JSON.stringify(before)).toBe(original)
    const renamed = applyCommand(document, {
      type: 'renameTopic',
      topicId: 'root',
      title: '新中心',
    })
    expect(renamed.title).toBe('新中心')
    expect(renamed.topics.root?.title).toBe('新中心')
    validateDocument(renamed)
  })

  it('deletes a whole subtree without leaving unreachable topics', () => {
    const document = applyCommand(branchDocument(), { type: 'deleteTopic', topicId: 'a' })
    expect(Object.keys(document.topics)).toEqual(['root', 'b'])
    expect(document.topics.root?.children).toEqual(['b'])
    validateDocument(document)
  })

  it('moves ordered subtrees, inherits direction, and expands the new parent in one operation', () => {
    const document = branchDocument()
    const collapsed = applyCommand(document, { type: 'toggleCollapse', topicId: 'b' })
    const moved = applyCommand(collapsed, {
      type: 'moveTopic',
      topicId: 'a1',
      parentId: 'b',
      index: 0,
    })
    expect(getParentId(moved, 'a1')).toBe('b')
    expect(moved.topics.a?.children).toEqual([])
    expect(moved.topics.b?.children).toEqual(['a1'])
    expect(moved.topics.b?.collapsed).toBe(false)
    expect(moved.topics.a1?.side).toBe('right')
    expect(moved.topics.a2?.side).toBe('right')
    const reordered = applyCommand(moved, {
      type: 'moveTopic',
      topicId: 'b',
      parentId: 'root',
      index: 0,
    })
    expect(reordered.topics.root?.children).toEqual(['b', 'a'])
    validateDocument(reordered)
  })

  it('changes an entire first-level branch direction and omits collapsed descendants', () => {
    const changed = applyCommand(branchDocument(), { type: 'setSide', topicId: 'a', side: 'right' })
    expect([changed.topics.a?.side, changed.topics.a1?.side, changed.topics.a2?.side]).toEqual([
      'right',
      'right',
      'right',
    ])
    const collapsed = applyCommand(changed, { type: 'toggleCollapse', topicId: 'a' })
    expect(getVisibleTopicIds(collapsed)).toEqual(['root', 'a', 'b'])
    const added = applyCommand(collapsed, {
      type: 'addTopic',
      parentId: 'a',
      id: 'new',
      title: '新主题',
    })
    expect(added.topics.a?.collapsed).toBe(false)
    expect(getVisibleTopicIds(added)).toEqual(['root', 'a', 'a1', 'a2', 'new', 'b'])
  })

  it.each<Command>([
    { type: 'deleteTopic', topicId: 'root' },
    { type: 'moveTopic', topicId: 'root', parentId: 'a' },
    { type: 'moveTopic', topicId: 'a', parentId: 'a2' },
    { type: 'moveTopic', topicId: 'a', parentId: 'a' },
    { type: 'moveTopic', topicId: 'a', parentId: 'missing' },
    { type: 'moveTopic', topicId: 'a', parentId: 'root', index: 3 },
    { type: 'addTopic', parentId: 'root', id: 'a', title: '重复' },
    { type: 'addTopic', parentId: 'root', id: '__proto__', title: '非法' },
    { type: 'addTopic', parentId: 'a', id: 'c', title: '错误方向', side: 'right' },
    { type: 'addTopic', parentId: 'a', id: 'c', title: '错误位置', index: -1 },
    { type: 'setSide', topicId: 'a1', side: 'right' },
    { type: 'setSide', topicId: 'root', side: 'left' },
    { type: 'renameTopic', topicId: 'constructor', title: '非法查找' },
  ])('rejects invalid command atomically: %j', (command) => {
    const document = branchDocument()
    const original = JSON.stringify(document)
    expect(() => applyCommand(document, command)).toThrow()
    expect(JSON.stringify(document)).toBe(original)
  })
})

describe('snapshot history', () => {
  it('undoes and redoes one operation, preserves no-ops, and clears redo after a new edit', () => {
    const original = createHistory(branchDocument())
    expect(undo(original)).toBe(original)
    expect(redo(original)).toBe(original)
    expect(executeCommand(original, { type: 'renameTopic', topicId: 'a', title: 'A' })).toBe(
      original,
    )
    expect(executeCommand(original, { type: 'setSide', topicId: 'a', side: 'left' })).toBe(original)
    expect(
      executeCommand(original, { type: 'moveTopic', topicId: 'a', parentId: 'root', index: 0 }),
    ).toBe(original)
    const changed = executeCommand(original, { type: 'moveTopic', topicId: 'a1', parentId: 'b' })
    expect(changed.past).toEqual([original.document])
    const undone = undo(changed)
    expect(undone.document).toBe(original.document)
    expect(redo(undone).document).toBe(changed.document)
    const replacement = executeCommand(undone, { type: 'deleteTopic', topicId: 'b' })
    expect(replacement.future).toEqual([])
    expect(redo(replacement)).toBe(replacement)
  })

  it('bounds retained snapshots without mutating earlier history', () => {
    const original = createHistory(createDocument('0', 'history'))
    let history = original
    for (let index = 1; index <= 110; index += 1)
      history = executeCommand(history, {
        type: 'renameTopic',
        topicId: 'root',
        title: String(index),
      })
    expect(history.past).toHaveLength(100)
    expect(history.past[0]?.title).toBe('10')
    expect(original.document.title).toBe('0')
    expect(original.past).toEqual([])
  })
})
