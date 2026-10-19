import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createWorkbook,
  serializeWorkbook,
} from '@core'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { isDirty, useEditor } from '@renderer/state/editor'
import { setSelectedTopics, useSelection } from '@renderer/state/selection'
import {
  advancePresentation,
  closePresentationWorkspace,
  openPresentationComposer,
  presentationSteps,
  setPresentationMode,
  selectPresentationPage,
  showPresentationStep,
  stopPresentation,
  usePresentation,
} from '@renderer/state/presentation'

const view = { x: 35, y: -60, zoom: 0.8 }
beforeEach(() => {
  closePresentationWorkspace()
  const document = applyCommand(createDocument('中心', 'first'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', id: 'a', parentId: 'root', title: 'A' },
      { type: 'addTopic', id: 'leaf', parentId: 'a', title: 'Leaf' },
      { type: 'addTopic', id: 'b', parentId: 'root', title: 'B' },
      { type: 'addFloatingTopic', id: 'floating', title: '游离', x: 100, y: 100 },
    ],
  })
  const workbook = applyWorkbookCommand(createWorkbook(document), {
    type: 'addSheet',
    sheet: { id: 'second', name: '第二页', document: createDocument('Second', 'second') },
  })
  useEditor.getState().replace(workbook)
  useEditor.setState({ busy: false })
})
afterEach(closePresentationWorkspace)

describe('independent slide presentation sessions', () => {
  it('generates a root overview and first-level pages without changing document/history/selection/view', () => {
    useEditor.getState().command({ type: 'toggleCollapse', topicId: 'a' })
    setSelectedTopics(['a', 'b'])
    useEditor.setState({ views: { first: view } })
    const before = useEditor.getState()
    const contents = serializeWorkbook(before.workbook)
    const dirty = isDirty()
    expect(presentationSteps(before.history.document).map(({ topicId }) => topicId)).toEqual([
      'root',
      'a',
      'b',
    ])
    showPresentationStep(0)
    expect(usePresentation.getState()).toMatchObject({
      playing: true,
      generated: true,
      index: 0,
      workspaceMode: 'audience',
    })
    showPresentationStep(2)
    expect(useEditor.getState().selectedId).toBe(before.selectedId)
    expect(useSelection.getState().sheets.first).toEqual(['a', 'b'])
    expect(useEditor.getState().views.first).toBe(view)
    useEditor.setState({ selectedId: 'root', views: { first: { x: 10, y: 20, zoom: 2 } } })
    useSelection.setState({ sheets: { first: ['root'] } })
    stopPresentation()
    expect(useEditor.getState().selectedId).toBe(before.selectedId)
    expect(useSelection.getState().sheets.first).toEqual(['a', 'b'])
    expect(useEditor.getState().views.first).toBe(view)
    expect(useEditor.getState().history).toBe(before.history)
    expect(serializeWorkbook(useEditor.getState().workbook)).toBe(contents)
    expect(isDirty()).toBe(dirty)
    expect(useEditor.getState().history.document.presentation).toBeUndefined()
    expect(usePresentation.getState().workspaceMode).toBeNull()
  })

  it('preserves saved order, skips hidden pages and reveals items before moving to the next page', () => {
    useEditor.getState().command({
      type: 'setPresentation',
      steps: [
        { topicId: 'a', reveal: 'items', layout: 'list', notes: '提示' },
        { topicId: 'root', hidden: true },
        { topicId: 'b' },
      ],
    })
    const history = useEditor.getState().history
    showPresentationStep(0)
    expect(usePresentation.getState().steps.map((step) => step.topicId)).toEqual(['a', 'b'])
    expect(usePresentation.getState().itemIndex).toBe(0)
    advancePresentation(1)
    expect(usePresentation.getState()).toMatchObject({ index: 0, itemIndex: 1 })
    advancePresentation(-1)
    expect(usePresentation.getState()).toMatchObject({ index: 0, itemIndex: 0 })
    advancePresentation(1)
    advancePresentation(1)
    expect(usePresentation.getState()).toMatchObject({ index: 1, itemIndex: 0 })
    advancePresentation(1)
    expect(usePresentation.getState().index).toBe(1)
    stopPresentation()
    expect(useEditor.getState().history).toBe(history)
  })

  it('windows long pages without dropping overflow items or advancing early', () => {
    useEditor.getState().command({
      type: 'batch',
      commands: Array.from({ length: 8 }, (_, index) => ({
        type: 'addTopic' as const,
        parentId: 'a',
        id: `child${index}`,
        title: `Item ${index}`,
      })),
    })
    showPresentationStep(1)
    expect(usePresentation.getState().itemIndex).toBe(6)
    advancePresentation(1)
    expect(usePresentation.getState()).toMatchObject({ index: 1, itemIndex: 9 })
    advancePresentation(-1)
    expect(usePresentation.getState()).toMatchObject({ index: 1, itemIndex: 6 })
    advancePresentation(1)
    advancePresentation(1)
    expect(usePresentation.getState().index).toBe(2)
  })

  it('returns to the composer after preview and switches presenter/audience without restarting the clock', () => {
    openPresentationComposer()
    selectPresentationPage(1)
    showPresentationStep(0)
    const startedAt = usePresentation.getState().startedAt
    setPresentationMode('presenter')
    expect(usePresentation.getState().workspaceMode).toBe('presenter')
    expect(usePresentation.getState().startedAt).toBe(startedAt)
    stopPresentation()
    expect(usePresentation.getState().workspaceMode).toBe('composer')
    expect(usePresentation.getState().composerIndex).toBe(1)
    closePresentationWorkspace()
    expect(usePresentation.getState().workspaceMode).toBeNull()
    setPresentationMode('presenter')
    expect(usePresentation.getState().workspaceMode).toBeNull()
  })

  it('stops on sheet or workbook replacement without copying old canvas session state', () => {
    useEditor.setState({ views: { first: view } })
    showPresentationStep(1)
    useEditor.getState().switchSheet('second')
    expect(usePresentation.getState().playing).toBe(false)
    expect(useEditor.getState().activeSheetId).toBe('second')
    expect(useEditor.getState().selectedId).toBe('root')
    useEditor.getState().switchSheet('first')
    const workbook = useEditor.getState().workbook
    showPresentationStep(1)
    useEditor.getState().replace(workbook)
    expect(usePresentation.getState().playing).toBe(false)
    expect(useEditor.getState().views).toEqual({})
    expect(usePresentation.getState().viewportRequest).toBeNull()
  })

  it('commits a title draft once before starting and keeps navigation outside history', () => {
    useEditor.getState().startEdit('a')
    useEditor.getState().setDraft('New title')
    showPresentationStep(0)
    expect(useEditor.getState().editingId).toBeNull()
    expect(useEditor.getState().history.document.topics.a?.title).toBe('New title')
    const history = useEditor.getState().history
    expect(history.past).toHaveLength(1)
    showPresentationStep(1)
    stopPresentation()
    expect(useEditor.getState().history).toBe(history)
  })

  it('rejects edits, annotations and history travel while playing', () => {
    showPresentationStep(0)
    const history = useEditor.getState().history
    expect(useEditor.getState().command({ type: 'toggleCollapse', topicId: 'root' })).toBe(false)
    selectAnnotation('relation', 'readonly', true)
    expect(useAnnotationInteraction.getState().editing).toBe(false)
    useEditor.getState().startEdit('a')
    useEditor.getState().undo()
    useEditor.getState().redo()
    expect(useEditor.getState().editingId).toBeNull()
    expect(useEditor.getState().history).toBe(history)
  })

  it('rejects out-of-range/all-hidden playback and retains invalid drafts', () => {
    showPresentationStep(999)
    expect(usePresentation.getState().playing).toBe(false)
    useEditor
      .getState()
      .command({ type: 'setPresentation', steps: [{ topicId: 'root', hidden: true }] })
    showPresentationStep(0)
    expect(usePresentation.getState().playing).toBe(false)
    useEditor.getState().startEdit('a', undefined, 'notes')
    useEditor.getState().setDraft('长'.repeat(100_001))
    showPresentationStep(0)
    expect(usePresentation.getState().playing).toBe(false)
    expect(useEditor.getState().editingId).toBe('a')
    expect(useEditor.getState().draft).toHaveLength(100_001)
  })
})
