import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import {
  indentOutlineTopic,
  insertParentTopic,
  removeTopicOnly,
  reorderSelectedTopic,
} from '@renderer/state/structuralEditing'

beforeEach(() => {
  const document = applyCommand(createDocument('中心', 'structural'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'A', side: 'left' },
      { type: 'addTopic', parentId: 'a', id: 'child', title: 'Child' },
      { type: 'addTopic', parentId: 'root', id: 'b', title: 'B', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'c', title: 'C', side: 'left' },
      { type: 'addFloatingTopic', id: 'floating', title: 'Floating', x: 0, y: 0 },
    ],
  })
  useEditor.getState().replace(document)
  useEditor.setState({ busy: false })
})

describe('structural editing actions', () => {
  it('inserts one parent and immediately starts editing its placeholder', () => {
    useEditor.getState().select('a')
    insertParentTopic()
    const state = useEditor.getState()
    const parentId = state.selectedId
    expect(state.history.document.topics.root?.children).toEqual([parentId, 'b', 'c', 'floating'])
    expect(state.history.document.topics[parentId]?.children).toEqual(['a'])
    expect(state.editingId).toBe(parentId)
    expect(state.draft).toBe('新主题')
    expect(state.history.past).toHaveLength(1)
    state.cancelEdit()
    state.undo()
    expect(useEditor.getState().history.document.topics.root?.children).toEqual([
      'a',
      'b',
      'c',
      'floating',
    ])
  })

  it('retains children when removing a topic and selects the first promoted child', () => {
    useEditor.getState().select('a')
    removeTopicOnly()
    expect(useEditor.getState().selectedId).toBe('child')
    expect(useEditor.getState().history.document.topics.root?.children).toEqual([
      'child',
      'b',
      'c',
      'floating',
    ])
    expect(useEditor.getState().history.past).toHaveLength(1)
    removeTopicOnly()
    expect(useEditor.getState().selectedId).toBe('root')
  })

  it('moves between visible same-side map siblings with one undo step and no history at boundaries', () => {
    useEditor.getState().select('a')
    const original = useEditor.getState().history
    reorderSelectedTopic(-1)
    expect(useEditor.getState().history).toBe(original)
    reorderSelectedTopic(1)
    const moved = useEditor.getState().history
    expect(moved.document.topics.root?.children).toEqual(['b', 'c', 'a', 'floating'])
    expect(moved.document.topics.a?.side).toBe('left')
    expect(moved.past).toHaveLength(1)
    expect(useEditor.getState().selectedId).toBe('a')
    reorderSelectedTopic(1)
    expect(useEditor.getState().history).toBe(moved)
    reorderSelectedTopic(-1)
    expect(useEditor.getState().history.document.topics.root?.children).toEqual([
      'b',
      'a',
      'c',
      'floating',
    ])
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toBe(moved.document)
    useEditor.getState().redo()
    expect(useEditor.getState().history.document.topics.root?.children).toEqual([
      'b',
      'a',
      'c',
      'floating',
    ])
  })

  it('uses raw sibling order for structured layouts', () => {
    useEditor.getState().command({ type: 'setDocumentSettings', settings: { layout: 'org-down' } })
    useEditor.getState().select('a')
    reorderSelectedTopic(1)
    expect(useEditor.getState().history.document.topics.root?.children).toEqual([
      'b',
      'a',
      'c',
      'floating',
    ])
    expect(useEditor.getState().history.document.topics.child?.side).toBe('left')
  })

  it.each(['root', 'floating'])('leaves %s unchanged for unsupported structural actions', (id) => {
    useEditor.getState().select(id)
    const history = useEditor.getState().history
    insertParentTopic()
    removeTopicOnly()
    reorderSelectedTopic(1)
    expect(useEditor.getState().history).toBe(history)
    expect(useEditor.getState().editingId).toBeNull()
  })

  it('indents and outdents existing outline topics without adding nodes, and stops at the root', () => {
    useEditor.getState().select('b')
    const count = Object.keys(useEditor.getState().history.document.topics).length
    indentOutlineTopic(1)
    expect(useEditor.getState().history.document.topics.a?.children).toEqual(['child', 'b'])
    expect(useEditor.getState().history.document.topics.root?.children).toEqual([
      'a',
      'c',
      'floating',
    ])
    indentOutlineTopic(-1)
    expect(useEditor.getState().history.document.topics.root?.children).toEqual([
      'a',
      'b',
      'c',
      'floating',
    ])
    const history = useEditor.getState().history
    indentOutlineTopic(-1)
    expect(useEditor.getState().history).toBe(history)
    expect(Object.keys(history.document.topics)).toHaveLength(count)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics.a?.children).toContain('b')
  })

  it('retains an invalid active draft and blocks structural edits', () => {
    useEditor.getState().startEdit('a', undefined, 'notes')
    useEditor.getState().setDraft('长'.repeat(100_001))
    const history = useEditor.getState().history
    insertParentTopic()
    removeTopicOnly()
    reorderSelectedTopic(1)
    expect(useEditor.getState().history).toBe(history)
    expect(useEditor.getState().editingId).toBe('a')
    expect(useEditor.getState().draft).toHaveLength(100_001)
  })
})
