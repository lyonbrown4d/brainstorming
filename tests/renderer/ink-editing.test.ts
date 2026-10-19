import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  type CanvasStroke,
  serializeDocument,
  deserializeDocument,
} from '@core'
import { inkGeometry, transformInk } from '@shared/ink-geometry'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import { canvasMoveCommand, canvasTopicRoots, canvasDescendants } from '@renderer/lib/canvasGesture'
import { useEditor } from '@renderer/state/editor'
import {
  useSelection,
  setCanvasSelection,
  selectedDrawingIds,
  selectedTopicIds,
  deleteSelectedTopics,
} from '@renderer/state/selection'
import { captureDocumentSession, restoreDocumentSession } from '@renderer/state/documentSession'
import { layoutDocument } from '@layout'
import {
  removeTopicOnly,
  insertParentTopic,
  reorderSelectedTopic,
} from '@renderer/state/structuralEditing'
import { duplicateSelectedTopics } from '@renderer/state/clipboard'

const stroke: CanvasStroke = {
  id: 'stroke',
  width: 4,
  color: '#123abc',
  points: [
    { x: 200, y: 100, pressure: 0.5 },
    { x: 300, y: 130, pressure: 0.8 },
  ],
}
const fixture = () =>
  applyCommand(createDocument('Map'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'branch', title: 'Branch' },
      { type: 'addTopic', parentId: 'branch', id: 'child', title: 'Child' },
      { type: 'addFloatingTopic', id: 'floating', title: 'Floating', x: 1000, y: 600 },
      { type: 'upsertDrawing', stroke },
    ],
  })
beforeEach(() => {
  useEditor.getState().replace(fixture())
  useSelection.setState({ sheets: {}, drawings: {} })
})

describe('ink shares canvas selection and history', () => {
  it('moves a branch, its descendants and ink atomically without reparenting or moving other components', () => {
    const editor = useEditor.getState()
    const document = editor.history.document
    const projection = projectCanvas(document)
    const before = layoutDocument(document)
    const roots = canvasTopicRoots(document, ['branch', 'child'])
    expect(roots).toEqual(['branch'])
    const command = canvasMoveCommand(
      document,
      roots,
      ['stroke'],
      new Map(projection.nodes.map((node) => [node.id, node.position])),
      { x: 60, y: -40 },
    )
    if (!command) throw new Error('Missing mixed move')
    expect(editor.command(command)).toBe(true)
    const moved = useEditor.getState().history.document
    const after = layoutDocument(moved)
    expect(moved.topics.root?.children).toEqual(document.topics.root?.children)
    expect(moved.topics.branch?.children).toEqual(['child'])
    for (const node of before.nodes) {
      const delta = ['branch', 'child'].includes(node.id) ? { x: 60, y: -40 } : { x: 0, y: 0 }
      expect(after.nodes.find((entry) => entry.id === node.id)).toMatchObject({
        x: node.x + delta.x,
        y: node.y + delta.y,
      })
    }
    const bounds = inkGeometry(stroke).bounds
    expect(inkGeometry(moved.drawings?.[0] ?? stroke).bounds).toMatchObject({
      x: bounds.x + 60,
      y: bounds.y - 40,
    })
    expect(useEditor.getState().history.past).toHaveLength(1)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toEqual(document)
    useEditor.getState().redo()
    expect(useEditor.getState().history.document).toEqual(moved)
  })

  it('scales the original outline and pressure samples exactly and validates malformed transforms atomically', () => {
    const before = inkGeometry(stroke)
    const next = transformInk(stroke, before.bounds, {
      x: -40,
      y: 60,
      width: before.bounds.width * 2,
      height: before.bounds.height * 3,
    })
    expect(next.points).toBe(stroke.points)
    const after = inkGeometry(next).bounds
    expect(after.x).toBeCloseTo(-40)
    expect(after.y).toBeCloseTo(60)
    expect(after.width).toBeCloseTo(before.bounds.width * 2)
    expect(after.height).toBeCloseTo(before.bounds.height * 3)
    const document = applyCommand(fixture(), { type: 'upsertDrawing', stroke: next })
    expect(deserializeDocument(serializeDocument(document)).drawings).toEqual([next])
    const snapshot = useEditor.getState().history
    for (const transform of [
      { x: 0, y: 0, scaleX: 0, scaleY: 1 },
      { x: Infinity, y: 0, scaleX: 1, scaleY: 1 },
      { x: 1e6, y: 0, scaleX: 2, scaleY: 1 },
    ]) {
      expect(
        useEditor.getState().command({ type: 'upsertDrawing', stroke: { ...stroke, transform } }),
      ).toBe(false)
      expect(useEditor.getState().history).toBe(snapshot)
    }
  })

  it('keeps ink-only selection from deleting the last active topic, and deletes a mixed selection in one undo', () => {
    useEditor.getState().select('branch')
    setCanvasSelection([], ['stroke'])
    const untouched = useEditor.getState().history
    removeTopicOnly()
    insertParentTopic()
    reorderSelectedTopic(1)
    duplicateSelectedTopics()
    expect(useEditor.getState().history).toBe(untouched)
    expect(selectedTopicIds(useEditor.getState())).toEqual([])
    deleteSelectedTopics()
    expect(useEditor.getState().history.document.topics.branch).toBeDefined()
    expect(useEditor.getState().history.document.drawings).toEqual([])
    useEditor.getState().undo()
    setCanvasSelection(['branch', 'child'], ['stroke'])
    const before = useEditor.getState().history
    deleteSelectedTopics()
    expect(useEditor.getState().history.document.topics.branch).toBeUndefined()
    expect(useEditor.getState().history.document.drawings).toEqual([])
    expect(useEditor.getState().history.past.length).toBe(before.past.length + 1)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toEqual(before.document)
  })

  it('isolates mixed selections between document sessions and keeps floating components independent of root movement', () => {
    setCanvasSelection(['branch'], ['stroke'])
    const session = captureDocumentSession()
    useEditor.getState().replace(createDocument('Other'))
    expect(selectedDrawingIds(useEditor.getState())).toEqual([])
    restoreDocumentSession(session)
    expect(selectedTopicIds(useEditor.getState())).toEqual(['branch'])
    expect(selectedDrawingIds(useEditor.getState())).toEqual(['stroke'])
    expect(canvasTopicRoots(fixture(), ['root', 'branch', 'floating'])).toEqual([
      'root',
      'floating',
    ])
    expect(canvasDescendants(fixture(), ['root'])).not.toContain('floating')
  })

  it('projects distinct renderer IDs and reuses untouched ink nodes without caching history', () => {
    const document = applyCommand(fixture(), {
      type: 'addTopic',
      parentId: 'root',
      id: 'ink:stroke',
      title: 'Collision',
    })
    const twoStrokes = applyCommand(document, {
      type: 'upsertDrawing',
      stroke: { ...stroke, id: 'ink:stroke' },
    })
    const project = createCanvasProjector()
    const before = project(twoStrokes)
    expect(new Set(before.nodes.map((node) => node.id)).size).toBe(before.nodes.length)
    const ink = before.nodes.find((node) => node.type === 'ink')
    expect(ink?.type).toBe('ink')
    const changed = project(
      applyCommand(document, { type: 'renameTopic', topicId: 'branch', title: 'Renamed' }),
    )
    expect(changed.nodes.find((node) => node.type === 'ink')).toBe(ink)
  })
})
