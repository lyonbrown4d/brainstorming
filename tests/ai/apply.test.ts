import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '../../src/core'
import { useEditor } from '../../src/renderer/src/state/editor'
import {
  aiContext,
  applyAIResult,
  captureAISnapshot,
} from '../../src/renderer/src/components/ai/apply'
import { assertAITree, type AITree } from '../../src/shared/ai'

const tree: AITree = {
  title: 'AI 建议 <script>',
  children: [
    { title: '新主题一', children: [] },
    { title: '新主题二', children: [] },
  ],
}
beforeEach(() => {
  useEditor.getState().replace(createDocument('原导图', 'original'))
})
describe('AI preview apply boundary', () => {
  it('adds a fresh-ID generated subtree with one undo while retaining original notes and data', () => {
    const before = useEditor.getState()
    before.command({ type: 'setTopicNotes', topicId: 'root', notes: '保留原备注' })
    const snapshot = captureAISnapshot()
    const document = useEditor.getState().history.document
    expect(applyAIResult(snapshot, tree, 'organize', () => false)).toBe(true)
    const applied = useEditor.getState().history.document
    expect(applied.topics.root?.notes).toBe('保留原备注')
    expect(Object.values(applied.topics).map((topic) => topic.title)).toContain('AI 建议 <script>')
    expect(Object.keys(applied.topics)).toHaveLength(4)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toEqual(document)
    useEditor.getState().redo()
    expect(Object.keys(useEditor.getState().history.document.topics)).toHaveLength(4)
  })
  it('adds a generated document as a new sheet with one structural undo', () => {
    const snapshot = captureAISnapshot()
    expect(applyAIResult(snapshot, tree, 'generate', useEditor.getState().addDocumentSheet)).toBe(
      true,
    )
    expect(useEditor.getState().workbook.sheets).toHaveLength(2)
    expect(useEditor.getState().history.document.title).toBe(tree.title)
    useEditor.getState().undo()
    expect(useEditor.getState().workbook.sheets).toHaveLength(1)
    expect(useEditor.getState().history.document.title).toBe('原导图')
  })
  it('refuses a stale generation result without mutating the changed document', () => {
    const snapshot = captureAISnapshot()
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: '已修改' })
    const current = useEditor.getState().workbook
    expect(() => applyAIResult(snapshot, tree, 'expand', () => false)).toThrow('已改变')
    expect(useEditor.getState().workbook).toBe(current)
  })
  it('only includes chosen plain titles/notes and enforces bounded context and generated trees', () => {
    useEditor.getState().command({ type: 'setTopicNotes', topicId: 'root', notes: '备注' })
    const snapshot = captureAISnapshot()
    expect(aiContext(snapshot, false)).toEqual([{ title: '原导图', depth: 0 }])
    expect(aiContext(snapshot, true)).toEqual([{ title: '原导图', notes: '备注', depth: 0 }])
    let tooDeep: AITree = { title: '叶', children: [] }
    for (let depth = 0; depth < 8; depth++) tooDeep = { title: '深', children: [tooDeep] }
    expect(() => {
      assertAITree(tooDeep)
    }).toThrow('8 层')
    expect(() => {
      assertAITree({ title: '无效命令', children: [], command: 'deleteAll' })
    }).toThrow('格式')
    expect(() => {
      assertAITree({
        title: '根',
        children: Array.from({ length: 33 }, () => ({ title: '子', children: [] })),
      })
    }).toThrow('格式')
    useEditor.getState().replace(
      applyCommand(createDocument('x'.repeat(12001)), {
        type: 'setTopicNotes',
        topicId: 'root',
        notes: '',
      }),
    )
    expect(() => aiContext(captureAISnapshot(), false)).toThrow('12000')
  })
})
