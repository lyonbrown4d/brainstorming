import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '../../src/core'
import { useEditor, isDirty } from '../../src/renderer/src/state/editor'
import { draftCommand } from '../../src/renderer/src/state/editorDraft'
import { setMetadataField } from '../../src/renderer/src/components/metadata/commands'
import { runAnnotationCommand } from '../../src/renderer/src/components/annotations/commands'
import {
  groupBounds,
  relationEdges,
} from '../../src/renderer/src/components/annotations/projection'

beforeEach(() => {
  useEditor.getState().replace(
    applyCommand(createDocument('中心'), {
      type: 'addTopic',
      parentId: 'root',
      id: 'a',
      title: '主题',
      side: 'right',
    }),
  )
  useEditor.setState({ busy: false })
})
describe('富文本与扩展信息编辑', () => {
  it('格式变化保持脏状态，恢复与提交使用相同原子命令，一次撤销恢复标题和格式', () => {
    setMetadataField('a', 'richTitle', '主题')
    const baseline = useEditor.getState().history.document
    useEditor.getState().replace(baseline)
    useEditor.getState().startEdit('a', undefined, 'rich-title')
    useEditor.getState().setRichDraft('**主题**', '主题')
    expect(isDirty()).toBe(true)
    const command = draftCommand(useEditor.getState())
    expect(command?.type).toBe('batch')
    const recovered = command ? applyCommand(baseline, command) : baseline
    useEditor.getState().commitDraft()
    const current = useEditor.getState()
    expect(current.history.document).toEqual(recovered)
    expect(current.history.document.topics.a?.title).toBe('主题')
    expect(current.history.document.topics.a?.metadata?.richTitle).toBe('**主题**')
    expect(current.history.past).toHaveLength(1)
    current.undo()
    expect(useEditor.getState().history.document).toEqual(baseline)
    expect(isDirty()).toBe(false)
  })
  it('修改其他元数据先保留正在编辑的富文本，移除字段不会清空其他内容', () => {
    useEditor.getState().startEdit('a', undefined, 'rich-title')
    useEditor.getState().setRichDraft('*新的*', '新的')
    setMetadataField('a', 'labels', ['研究'])
    expect(useEditor.getState().history.document.topics.a?.metadata).toEqual({
      richTitle: '*新的*',
      labels: ['研究'],
    })
    setMetadataField('a', 'labels', undefined)
    expect(useEditor.getState().history.document.topics.a?.metadata).toEqual({
      richTitle: '*新的*',
    })
    useEditor.getState().startEdit('a', undefined, 'notes')
    useEditor.getState().setDraft('**粗体备注**\n\n- 清单')
    useEditor.getState().commitDraft()
    expect(useEditor.getState().history.document.topics.a?.notes).toBe('**粗体备注**\n\n- 清单')
  })
  it('非法任务日期不覆盖已有信息，失败草稿不能被元数据保存覆盖', () => {
    setMetadataField('a', 'task', { done: false, start: '2026-10-16', due: '2026-10-15' })
    expect(useEditor.getState().history.document.topics.a?.metadata).toBeUndefined()
    expect(useEditor.getState().error).toBeTruthy()
    useEditor.getState().startEdit('a', undefined, 'notes')
    useEditor.getState().setDraft('长'.repeat(100001))
    expect(setMetadataField('a', 'labels', ['不能覆盖草稿'])).toBe(false)
    expect(useEditor.getState().editingId).toBe('a')
    expect(useEditor.getState().history.document.topics.a?.metadata).toBeUndefined()
  })
})
describe('画布注解投影', () => {
  it('分组范围保留边距，空分组不产生图形，隐藏端点的关联线不渲染', () => {
    expect(groupBounds([])).toBeNull()
    expect(
      groupBounds([
        { x: 10, y: 20, width: 100, height: 40 },
        { x: 160, y: 50, width: 120, height: 60 },
      ]),
    ).toEqual({ x: -6, y: -6, width: 302, height: 132 })
    runAnnotationCommand({
      type: 'upsertRelation',
      relation: {
        id: 'relation',
        from: 'root',
        to: 'a',
        title: '关联',
        dashed: true,
        arrow: 'both',
      },
    })
    const document = useEditor.getState().history.document
    expect(relationEdges(document, new Set(['root']))).toEqual([])
    const edges = relationEdges(document, new Set(['root', 'a']))
    expect(edges).toHaveLength(1)
    expect(edges[0]?.markerStart).toBeDefined()
    expect(edges[0]?.markerEnd).toBeDefined()
    expect(edges[0]?.style?.strokeDasharray).toBe('6 4')
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.relations).toBeUndefined()
  })
})
