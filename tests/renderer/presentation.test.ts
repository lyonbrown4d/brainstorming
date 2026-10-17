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
import { useSpatialView } from '@renderer/state/spatial'
import {
  presentationSteps,
  showPresentationStep,
  stopPresentation,
  usePresentation,
} from '@renderer/state/presentation'

const camera = { position: [2, 5, 10] as const, target: [0, 0, 0] as const }
const savedCamera = { position: [8, 9, 12] as const, target: [1, 2, 0] as const }
const view = { x: 35, y: -60, zoom: 0.8 }

beforeEach(() => {
  stopPresentation()
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
afterEach(stopPresentation)

describe('transient presentation sessions', () => {
  it('builds a visible depth-first route without saving steps, history or dirty content', () => {
    useEditor.getState().command({ type: 'toggleCollapse', topicId: 'a' })
    const before = useEditor.getState()
    const contents = serializeWorkbook(before.workbook)
    expect(presentationSteps(before.history.document).map(({ topicId }) => topicId)).toEqual([
      'root',
      'a',
      'b',
      'floating',
    ])
    const dirty = isDirty()
    showPresentationStep(0)
    expect(usePresentation.getState()).toMatchObject({ playing: true, generated: true, index: 0 })
    showPresentationStep(3)
    expect(useEditor.getState().selectedId).toBe('floating')
    expect(useEditor.getState().history).toBe(before.history)
    stopPresentation()
    expect(useEditor.getState().selectedId).toBe(before.selectedId)
    expect(serializeWorkbook(useEditor.getState().workbook)).toBe(contents)
    expect(isDirty()).toBe(dirty)
    expect(useEditor.getState().history.document.presentation).toBeUndefined()
  })

  it('plays saved camera steps and restores selection, mode, focus and 2D viewport', () => {
    useEditor.getState().command({
      type: 'setPresentation',
      steps: [{ topicId: 'a', camera: savedCamera }, { topicId: 'leaf' }],
    })
    setSelectedTopics(['a', 'b'])
    useEditor.setState({ views: { first: view } })
    const before = useEditor.getState().history
    showPresentationStep(0)
    expect(usePresentation.getState().generated).toBe(false)
    expect(usePresentation.getState().cameraRequest?.camera).toEqual(savedCamera)
    expect(useSpatialView.getState().sheets.first?.mode).toBe('3d')
    showPresentationStep(1)
    expect(useSpatialView.getState().sheets.first?.focusId).toBe('leaf')
    useEditor.setState({ views: { first: { x: 400, y: 300, zoom: 1.2 } } })
    stopPresentation()
    expect(useEditor.getState().selectedId).toBe('b')
    expect(useSelection.getState().sheets.first).toEqual(['a', 'b'])
    expect(useSpatialView.getState().sheets.first).toBeUndefined()
    expect(useEditor.getState().views.first).toEqual(view)
    expect(usePresentation.getState().viewportRequest?.view).toEqual(view)
    expect(useEditor.getState().history).toBe(before)
  })

  it('restores an existing 3D camera even when its focus has not changed', () => {
    useSpatialView.getState().setMode('first', '3d')
    useSpatialView.getState().setFocus('first', 'a')
    useSpatialView.getState().setCamera('first', camera)
    showPresentationStep(1)
    useSpatialView.getState().setCamera('first', savedCamera)
    stopPresentation()
    expect(useSpatialView.getState().sheets.first).toEqual({ mode: '3d', focusId: 'a', camera })
    expect(usePresentation.getState().cameraRequest?.camera).toEqual(camera)
    useEditor.getState().replace(useEditor.getState().workbook)
    expect(usePresentation.getState().cameraRequest).toBeNull()
    expect(usePresentation.getState().viewportRequest).toBeNull()
  })

  it('stops on Sheet change, restoring the original Sheet without changing the destination', () => {
    useEditor.getState().select('b')
    useEditor.setState({ views: { first: view } })
    showPresentationStep(1)
    useEditor.getState().switchSheet('second')
    expect(usePresentation.getState().playing).toBe(false)
    expect(useEditor.getState().activeSheetId).toBe('second')
    expect(useEditor.getState().selectedId).toBe('root')
    useEditor.getState().switchSheet('first')
    expect(useEditor.getState().selectedId).toBe('b')
    expect(useEditor.getState().views.first).toEqual(view)
  })

  it('does not copy the old view into a replacement workbook, even with the same IDs', () => {
    useEditor.getState().select('b')
    useSpatialView.getState().setMode('first', '3d')
    useSpatialView.getState().setCamera('first', camera)
    const workbook = useEditor.getState().workbook
    showPresentationStep(1)
    useEditor.getState().replace(workbook)
    expect(usePresentation.getState().playing).toBe(false)
    expect(useEditor.getState().selectedId).toBe('root')
    expect(useSpatialView.getState().sheets).toEqual({})
    expect(useEditor.getState().views).toEqual({})
  })

  it('commits a draft before starting and adds no history for navigation or stop', () => {
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

  it('rejects editing, fold commands and history travel while playing', () => {
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
    expect(usePresentation.getState().playing).toBe(true)
  })

  it('retains an invalid draft and rejects out-of-range steps without starting playback', () => {
    showPresentationStep(999)
    expect(usePresentation.getState().playing).toBe(false)
    useEditor.getState().startEdit('a', undefined, 'notes')
    useEditor.getState().setDraft('长'.repeat(100_001))
    showPresentationStep(0)
    expect(usePresentation.getState().playing).toBe(false)
    expect(useEditor.getState().editingId).toBe('a')
    expect(useEditor.getState().draft).toHaveLength(100_001)
  })
})
