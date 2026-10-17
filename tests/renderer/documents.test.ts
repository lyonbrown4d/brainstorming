import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument, validateDocument } from '@core'
import { documentAppearance, topicAppearance } from '@shared/appearance'
import { useEditor } from '@renderer/state/editor'
import { createTemplate, templateOptions } from '@renderer/components/documents/templates'
import { edgeHandles, projectCanvas } from '@renderer/components/documents/projectCanvas'
import {
  armFloatingTopic,
  createFloatingAt,
  interactAnnotationTopic,
  toggleRelationMode,
  useAnnotationInteraction,
} from '@renderer/state/annotationInteraction'
import {
  presentationDocument,
  showPresentationStep,
  stopPresentation,
  usePresentation,
} from '@renderer/state/presentation'
import { defaultTopicFilters, filterTopics } from '@renderer/components/documents/filterTopics'

beforeEach(() => {
  useEditor.getState().replace(
    applyCommand(createDocument('中心'), {
      type: 'addTopic',
      id: 'a',
      parentId: 'root',
      title: '分支',
      side: 'right',
    }),
  )
  useEditor.setState({ busy: false })
  useAnnotationInteraction.setState({
    floating: false,
    fromId: null,
    sheetId: null,
    selected: null,
    editing: false,
  })
  stopPresentation()
})
describe('文档编辑能力', () => {
  it('四个模板是真实可编辑主题树且标识互不复用，主题外观与覆盖一致', () => {
    for (const template of templateOptions) {
      const first = createTemplate(template.id),
        second = createTemplate(template.id)
      validateDocument(first)
      expect(Object.keys(first.topics)).toHaveLength(13)
      expect(first.id).not.toBe(second.id)
      expect(
        Object.keys(first.topics)
          .filter((id) => id !== 'root')
          .some((id) => second.topics[id]),
      ).toBe(false)
    }
    let document = applyCommand(useEditor.getState().history.document, {
      type: 'setDocumentSettings',
      settings: { theme: 'ocean', fontFamily: 'serif', lineWidth: 5, background: '#ffffff' },
    })
    expect(documentAppearance(document).background).toBe('#ffffff')
    expect(topicAppearance(document, 'a')).toMatchObject({ fontFamily: 'serif', lineWidth: 5 })
    document = applyCommand(document, {
      type: 'setTopicStyle',
      topicId: 'a',
      style: { fill: '#112233' },
    })
    expect(topicAppearance(document, 'a').fill).toBe('#112233')
  })
  it('连线模式点击目标创建单次历史，游离模式在真实坐标创建并保持独立位置', () => {
    toggleRelationMode()
    expect(interactAnnotationTopic('a')).toBe(true)
    expect(useEditor.getState().history.document.relations?.[0]).toMatchObject({
      from: 'root',
      to: 'a',
    })
    expect(useAnnotationInteraction.getState().editing).toBe(true)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.relations).toBeUndefined()
    armFloatingTopic()
    expect(createFloatingAt(420, -30)).toBe(true)
    const state = useEditor.getState(),
      id = state.selectedId
    expect(state.history.document.floatingPositions?.[id]).toEqual({ x: 420, y: -30 })
    expect(state.editingId).toBe(id)
    expect(
      projectCanvas(state.history.document).nodes.find((node) => node.id === id)?.position,
    ).toEqual({ x: 420, y: -30 })
  })
  it('演示仅显式记录步骤，播放临时展开分支且不修改历史，新增画布一次撤销', () => {
    const state = useEditor.getState()
    state.command({ type: 'toggleCollapse', topicId: 'root' })
    state.command({ type: 'setPresentation', steps: [{ topicId: 'a' }] })
    const before = useEditor.getState().history
    showPresentationStep(0)
    expect(usePresentation.getState().playing).toBe(true)
    expect(useEditor.getState().history).toBe(before)
    expect(presentationDocument(before.document, 'a').topics.root?.collapsed).toBe(false)
    expect(before.document.topics.root?.collapsed).toBe(true)
    stopPresentation()
    expect(state.addDocumentSheet(createTemplate('study'))).toBe(true)
    expect(useEditor.getState().workbook.sheets).toHaveLength(2)
    state.undo()
    expect(useEditor.getState().workbook.sheets).toHaveLength(1)
  })
  it('默认导图显式连接左右端口，垂直布局使用上下端口', () => {
    const document = useEditor.getState().history.document
    expect(projectCanvas(document).edges[0]).toMatchObject({
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    })
    const vertical = applyCommand(document, {
      type: 'setDocumentSettings',
      settings: { layout: 'org-down' },
    })
    expect(projectCanvas(vertical).edges[0]).toMatchObject({
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    })
  })
  it('标签、图标与逾期任务交叉筛选，隐藏节点仍保留模型', () => {
    const document = applyCommand(useEditor.getState().history.document, {
      type: 'setTopicMetadata',
      topicId: 'a',
      metadata: {
        labels: ['研究'],
        markers: ['star'],
        task: { done: false, priority: 1, due: '2026-10-15', assignee: 'Ada' },
      },
    })
    expect(
      filterTopics(
        document,
        {
          ...defaultTopicFilters,
          label: '研究',
          marker: 'star',
          task: 'overdue',
          priority: '1',
          assignee: 'ada',
        },
        '2026-10-16',
      ).map((topic) => topic.id),
    ).toEqual(['a'])
    expect(filterTopics(document, { ...defaultTopicFilters, task: 'done' }, '2026-10-16')).toEqual(
      [],
    )
    expect(Object.keys(document.topics)).toHaveLength(2)
    const source = { id: 's', x: 0, y: 0, width: 100, height: 40, side: 'right' as const },
      target = { ...source, id: 't', x: 50, y: 200 }
    expect(edgeHandles(source, target, 'down')).toEqual({
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    })
  })
})
