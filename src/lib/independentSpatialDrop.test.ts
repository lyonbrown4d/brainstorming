import { expect, it } from 'vitest'
import { applyCommand, createDocument, createHistory, executeCommand, undo } from '@core'
import type { MindMapLayout } from '@layout'
import { createIndependentSpatialDropFinder } from '@renderer/lib/independentSpatialDrop'
import {
  createIndependentSpatialRuntime,
  type SpatialSceneRect,
} from '@renderer/lib/independentSpatialRuntime'
import { independentSpatialMove } from '@renderer/lib/independentSpatialGestureSession'

const fixture = () => {
  const document = applyCommand(createDocument('Drop'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'target', title: 'Target' },
      { type: 'addTopic', parentId: 'root', id: 'moving', title: 'Moving' },
      { type: 'addTopic', parentId: 'moving', id: 'child', title: 'Child' },
    ],
  })
  const rectangles: SpatialSceneRect[] = [
    { id: 'root', kind: 'topic', x: -400, y: 0, width: 100, height: 40, depth: 100 },
    { id: 'target', kind: 'topic', x: 0, y: 0, width: 100, height: 40, depth: 100 },
    { id: 'moving', kind: 'topic', x: 500, y: 300, width: 100, height: 40, depth: 100 },
    { id: 'child', kind: 'topic', x: 700, y: 300, width: 100, height: 40, depth: 100 },
  ]
  const layout: MindMapLayout = {
    nodes: rectangles.map((rect) => ({ ...rect, side: 'right', direction: 'right' })),
    edges: [],
  }
  const runtime = createIndependentSpatialRuntime({ document, layout, depths: {}, surface: '#fff' })
  const move = independentSpatialMove(runtime, ['moving'], [])
  return {
    document,
    runtime,
    move,
    find: createIndependentSpatialDropFinder(document, layout, rectangles, move.excluded),
    rectangles,
    layout,
  }
}

it('predicts before contact and reparents a whole branch with a single undoable command', () => {
  const { document, move, find } = fixture()
  const drop = find({ x: 215, y: 20 }, { x: 120, y: 0, width: 100, height: 40 })
  expect(drop).toMatchObject({ targetId: 'target', parentId: 'target', predicted: true })
  move.preview({ x: -380, y: -300, z: 20 })
  const command = move.finish(drop)
  if (!command) throw new Error('Missing drop command')
  const history = executeCommand(createHistory(document), command)
  expect(history.document.topics.target?.children).toEqual(['moving'])
  expect(history.document.topics.moving?.children).toEqual(['child'])
  expect(history.past).toHaveLength(1)
  expect(undo(history).document).toBe(document)
})

it('allows free placement away from targets and excludes a dragged subtree from targeting', () => {
  const { find } = fixture()
  expect(find({ x: 1500, y: 1500 }, { x: 1450, y: 1480, width: 100, height: 40 })).toBeUndefined()
  expect(find({ x: 750, y: 320 }, { x: 700, y: 300, width: 100, height: 40 })).toBeUndefined()
  expect(find({ x: -180, y: 20 }, { x: -280, y: 0, width: 100, height: 40 })).toBeUndefined()
})

it('uses frontmost visible bodies and resets a prediction after leaving the halo', () => {
  const { document, layout, rectangles, move } = fixture()
  const find = createIndependentSpatialDropFinder(
    document,
    layout,
    rectangles.map((rect) => (rect.id === 'root' ? { ...rect, x: 0, depth: 200 } : rect)),
    move.excluded,
  )
  expect(find({ x: 50, y: 20 }, { x: 20, y: 0, width: 100, height: 40 })?.targetId).toBe('target')
  const predict = createIndependentSpatialDropFinder(document, layout, rectangles, move.excluded)
  expect(predict({ x: 215, y: 20 }, { x: 120, y: 0, width: 100, height: 40 })?.predicted).toBe(true)
  expect(predict({ x: 1000, y: 20 }, { x: 950, y: 0, width: 100, height: 40 })).toBeUndefined()
  expect(find({ x: NaN, y: 20 }, { x: 20, y: 0, width: 100, height: 40 })).toBeUndefined()
})
