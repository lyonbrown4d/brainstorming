import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument, validateDocument } from '@core'
import { documentAppearance, topicAppearance } from '@shared/appearance'
import { useEditor } from '@renderer/state/editor'
import { instantiateTemplate } from '@renderer/components/documents/templates'
import { fixtureTemplate, fixtureCatalog } from '@tests/fixtures/templates'
import type { TemplateId } from '@shared/templates'

const templateOptions = fixtureCatalog.templates
const createTemplate = (id: TemplateId) => instantiateTemplate(fixtureTemplate(id), 'zh-CN')
import { edgeHandles, projectCanvas } from '@renderer/components/documents/projectCanvas'
import {
  armFloatingTopic,
  createFloatingAt,
  createRelationFloatingAt,
  interactAnnotationTopic,
  toggleRelationMode,
  useAnnotationInteraction,
} from '@renderer/state/annotationInteraction'
import { setCanvasSelection, useSelection } from '@renderer/state/selection'
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
    relationMode: false,
    fromId: null,
    sheetId: null,
    selected: null,
    editing: false,
  })
  useSelection.setState({ sheets: {}, drawings: {} })
  stopPresentation()
})
describe('文档编辑能力', () => {
  it('内容模板是真实可编辑主题树且标识互不复用，主题外观与覆盖一致', () => {
    for (const template of templateOptions) {
      const first = createTemplate(template.id),
        second = createTemplate(template.id)
      validateDocument(first)
      expect(Object.keys(first.topics)).toHaveLength(template.count)
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
  it('两个已选主题直接建立关联线，无选择时依次点击两个主题', () => {
    setCanvasSelection(['root', 'a'], [])
    toggleRelationMode()
    expect(useEditor.getState().history.document.relations?.[0]).toMatchObject({
      from: 'root',
      to: 'a',
    })
    expect(useAnnotationInteraction.getState().relationMode).toBe(false)
    useEditor.getState().undo()
    setCanvasSelection([], [])
    toggleRelationMode()
    expect(useAnnotationInteraction.getState()).toMatchObject({ relationMode: true, fromId: null })
    expect(interactAnnotationTopic('a')).toBe(true)
    expect(useEditor.getState().history.document.relations).toBeUndefined()
    expect(interactAnnotationTopic('root')).toBe(true)
    expect(useEditor.getState().history.document.relations?.[0]).toMatchObject({
      from: 'a',
      to: 'root',
    })
  })
  it('关联线空白终点创建游离主题，创建与关联为一次撤销', () => {
    toggleRelationMode()
    expect(createRelationFloatingAt(420, -30)).toBe(true)
    const document = useEditor.getState().history.document
    const floatingId = document.floatingIds?.[0]
    expect(floatingId).toBeDefined()
    expect(floatingId ? document.floatingPositions?.[floatingId] : undefined).toEqual({
      x: 420,
      y: -30,
    })
    expect(document.relations?.[0]).toMatchObject({ from: 'root', to: floatingId })
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.floatingIds).toBeUndefined()
    expect(useEditor.getState().history.document.relations).toBeUndefined()
  })
  it('未选起点时可在空白处依次创建两个游离主题并关联', () => {
    setCanvasSelection([], [])
    toggleRelationMode()
    expect(createRelationFloatingAt(100, 50)).toBe(true)
    const firstId = useEditor.getState().history.document.floatingIds?.[0]
    expect(useAnnotationInteraction.getState().fromId).toBe(firstId)
    expect(createRelationFloatingAt(280, 90)).toBe(true)
    const document = useEditor.getState().history.document
    expect(document.floatingIds).toHaveLength(2)
    expect(document.relations?.[0]).toMatchObject({ from: firstId, to: document.floatingIds?.[1] })
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.floatingIds).toEqual([firstId])
    expect(useEditor.getState().history.document.relations).toBeUndefined()
  })
  it('忙碌状态不报告创建成功，且不写入游离主题或关联线', () => {
    toggleRelationMode()
    useEditor.setState({ busy: true })
    expect(createRelationFloatingAt(100, 50)).toBe(false)
    const document = useEditor.getState().history.document
    expect(document.floatingIds).toBeUndefined()
    expect(document.relations).toBeUndefined()
    useEditor.setState({ busy: false })
  })
  it('演示仅显式记录页面，播放保留原画布折叠和历史，新增画布一次撤销', () => {
    const state = useEditor.getState()
    state.command({ type: 'toggleCollapse', topicId: 'root' })
    state.command({ type: 'setPresentation', steps: [{ topicId: 'a' }] })
    const before = useEditor.getState().history
    showPresentationStep(0)
    expect(usePresentation.getState().playing).toBe(true)
    expect(useEditor.getState().history).toBe(before)
    expect(presentationDocument(before.document, 'a')).toBe(before.document)
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
