import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createWorkbook,
  serializeWorkbook,
} from '../../src/core'
import { isDirty, useEditor } from '../../src/renderer/src/state/editor'
import { useSpatialView, visibleSpatialFocus } from '../../src/renderer/src/state/spatial'
import { changeViewMode } from '../../src/renderer/src/components/ViewModeSwitch'

const camera = { position: [2, 5, 10] as const, target: [0, 0, 0] as const }

beforeEach(() => {
  const first = applyCommand(createDocument('第一页', 'first'), {
    type: 'addTopic',
    parentId: 'root',
    id: 'branch',
    title: '分支',
  })
  const workbook = applyWorkbookCommand(createWorkbook(first), {
    type: 'addSheet',
    sheet: { id: 'second', name: '第二页', document: createDocument('第二页', 'second') },
  })
  useEditor.getState().replace(workbook)
  useEditor.setState({ inspectorOpen: false })
})

describe('三维视图与文档状态边界', () => {
  it('逐页保留维度、聚焦与相机，切换视图不修改内容、选择和历史', () => {
    useEditor.getState().select('branch')
    const before = useEditor.getState()
    const contents = serializeWorkbook(before.workbook)
    expect(changeViewMode('3d')).toBe(true)
    useSpatialView.getState().setFocus('first', 'branch')
    useSpatialView.getState().setCamera('first', camera)
    useEditor.getState().switchSheet('second')
    expect(useSpatialView.getState().sheets.second).toBeUndefined()
    expect(changeViewMode('3d')).toBe(true)
    useSpatialView.getState().setCamera('second', { position: [8, 9, 10], target: [1, 0, 0] })
    useEditor.getState().switchSheet('first')
    expect(useSpatialView.getState().sheets.first).toEqual({
      mode: '3d',
      focusId: 'branch',
      camera,
    })
    expect(changeViewMode('2d')).toBe(true)
    expect(changeViewMode('3d')).toBe(true)
    expect(useSpatialView.getState().sheets.first?.camera).toEqual(camera)
    expect(useEditor.getState().selectedId).toBe('branch')
    expect(useEditor.getState().history).toBe(before.history)
    expect(serializeWorkbook(useEditor.getState().workbook)).toBe(contents)
    expect(isDirty()).toBe(false)
  })

  it('打开或替换同 ID 工作簿时清空旧视图，聚焦新分支时丢弃旧相机', () => {
    changeViewMode('3d')
    useSpatialView.getState().setCamera('first', camera)
    useSpatialView.getState().setFocus('first', 'branch')
    expect(useSpatialView.getState().sheets.first?.camera).toBeUndefined()
    useSpatialView.getState().setCamera('first', camera)
    useEditor.getState().replace(useEditor.getState().workbook)
    expect(useSpatialView.getState().sheets).toEqual({})
    expect(isDirty()).toBe(false)
  })

  it('切换模式先提交一次草稿，非法备注阻止切换并保留输入', () => {
    useEditor.getState().startEdit('branch')
    useEditor.getState().setDraft('修改标题')
    expect(changeViewMode('3d')).toBe(true)
    expect(useEditor.getState().history.document.topics.branch?.title).toBe('修改标题')
    expect(useEditor.getState().history.past).toHaveLength(1)
    useEditor.getState().startEdit('branch', undefined, 'notes')
    const invalid = '长'.repeat(100_001)
    useEditor.getState().setDraft(invalid)
    expect(changeViewMode('2d')).toBe(false)
    expect(useSpatialView.getState().sheets.first?.mode).toBe('3d')
    expect(useEditor.getState().editingSurface).toBe('notes')
    expect(useEditor.getState().draft).toBe(invalid)
    expect(useEditor.getState().history.past).toHaveLength(1)
    expect(useEditor.getState().error).toContain('100000')
  })

  it('三维新增和 F2 在卡片中编辑且不打开侧栏，二维编辑仍属于画布', () => {
    changeViewMode('3d')
    useEditor.getState().startEdit('branch')
    expect(useEditor.getState().editingSurface).toBe('spatial')
    expect(useEditor.getState().inspectorOpen).toBe(false)
    useEditor.getState().commitDraft()
    useEditor.setState({ inspectorOpen: false })
    useEditor.getState().add('child')
    const added = useEditor.getState().selectedId
    expect(added).not.toBe('branch')
    expect(useEditor.getState().history.document.topics.branch?.children).toContain(added)
    expect(useEditor.getState().editingSurface).toBe('spatial')
    expect(useEditor.getState().inspectorOpen).toBe(false)
    expect(useEditor.getState().history.past).toHaveLength(1)
    changeViewMode('2d')
    useEditor.getState().startEdit('branch')
    expect(useEditor.getState().editingSurface).toBe('canvas')
  })

  it('三维标题取消与提交保留备注，显式备注编辑仍打开侧栏', () => {
    changeViewMode('3d')
    useEditor.getState().startEdit('branch', undefined, 'notes')
    expect(useEditor.getState().editingSurface).toBe('notes')
    expect(useEditor.getState().inspectorOpen).toBe(true)
    useEditor.getState().setDraft('保留的备注')
    useEditor.getState().commitDraft()
    useEditor.setState({ inspectorOpen: false })
    useEditor.getState().startEdit('branch')
    useEditor.getState().setDraft('放弃的标题')
    useEditor.getState().cancelEdit()
    expect(useEditor.getState().history.document.topics.branch?.title).toBe('分支')
    expect(useEditor.getState().history.past).toHaveLength(1)
    useEditor.getState().startEdit('branch')
    useEditor.getState().setDraft('三维修改')
    useEditor.getState().setDraft('三维修改完成')
    useEditor.getState().commitDraft()
    useEditor.getState().commitDraft()
    expect(useEditor.getState().history.document.topics.branch?.title).toBe('三维修改完成')
    expect(useEditor.getState().history.document.topics.branch?.notes).toBe('保留的备注')
    expect(useEditor.getState().history.past).toHaveLength(2)
    expect(useEditor.getState().inspectorOpen).toBe(false)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics.branch?.title).toBe('分支')
    expect(useEditor.getState().history.document.topics.branch?.notes).toBe('保留的备注')
  })
})

it('聚焦主题删除后返回全图，祖先折叠后回到可见分支', () => {
  const document = applyCommand(useEditor.getState().history.document, {
    type: 'addTopic',
    parentId: 'branch',
    id: 'leaf',
    title: '叶子',
  })
  expect(visibleSpatialFocus(document, 'leaf')).toBe('leaf')
  const folded = applyCommand(document, { type: 'toggleCollapse', topicId: 'branch' })
  expect(visibleSpatialFocus(folded, 'leaf')).toBe('branch')
  const rootFolded = applyCommand(folded, { type: 'toggleCollapse', topicId: 'root' })
  expect(visibleSpatialFocus(rootFolded, 'leaf')).toBeNull()
  const removed = applyCommand(document, { type: 'deleteTopic', topicId: 'leaf' })
  expect(visibleSpatialFocus(removed, 'leaf')).toBeNull()
  expect(visibleSpatialFocus(document, 'root')).toBeNull()
})
