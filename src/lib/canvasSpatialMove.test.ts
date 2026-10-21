import { expect, it } from 'vitest'
import {
  applyCommand,
  createFixtureDocument,
  createHistory,
  executeCommand,
  redo,
  undo,
  type CanvasStroke,
} from '@core'
import { layoutDocument } from '@layout'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { canvasMoveCommand } from '@renderer/lib/canvasGesture'
import { spatialCameraDelta } from '@renderer/lib/spatialCamera'
import { captureSpatialOrigins, projectSpatialLayout } from '@renderer/lib/spatialProjection'
import type { SpatialView } from '@renderer/state/spatialView'

const view: SpatialView = {
  mode: '3d',
  yaw: Math.PI / 2,
  pitch: 0.55,
  spacing: 100,
  target: { x: 110, y: 75, z: 35 },
}
const stroke: CanvasStroke = {
  id: 'stroke-a',
  color: '#334455',
  width: 4,
  spatialDepth: 30,
  points: [
    { x: 440, y: 150, pressure: 0.7 },
    { x: 500, y: 190, pressure: 1 },
  ],
}

it('moves a floating topic and collision-prefixed ink together in one undo step', () => {
  const original = applyCommand(createFixtureDocument(2), {
    type: 'batch',
    commands: [
      { type: 'addFloatingTopic', id: 'float', title: 'Free', x: 300, y: 100 },
      { type: 'setTopicStyle', topicId: 'float', style: { spatialDepth: 90 } },
      { type: 'addFloatingTopic', id: 'ink:stroke-a', title: 'Collision', x: 700, y: 250 },
      { type: 'upsertDrawing', stroke },
    ],
  })
  const native = layoutDocument(original)
  const projected = projectSpatialLayout(original, native, view)
  const before = projectCanvas(original, undefined, projected, view).nodes
  const topic = before.find((node) => node.id === 'float')
  const ink = before.find((node) => node.type === 'ink')
  if (!topic || !ink) throw new Error('missing projected nodes')
  expect(ink.id).toBe('ink:ink:stroke-a')
  const { nativeOrigins } = captureSpatialOrigins(original, view, before, undefined, native)
  expect(nativeOrigins.get(ink.id)).toBeDefined()
  expect(nativeOrigins.get('float')).toMatchObject({ x: 300, y: 100 })

  const screenDelta = { x: 75, y: -48 }
  const delta = spatialCameraDelta(view, screenDelta)
  const command = canvasMoveCommand(original, ['float'], [stroke.id], nativeOrigins, delta)
  if (!command) throw new Error('missing mixed move command')
  const moved = executeCommand(createHistory(original), command)
  expect(moved.past).toHaveLength(1)
  const movedLayout = projectSpatialLayout(moved.document, layoutDocument(moved.document), view)
  const after = projectCanvas(moved.document, undefined, movedLayout, view).nodes
  for (const node of [topic, ink]) {
    const next = after.find((item) => item.id === node.id)
    expect(next?.position.x).toBeCloseTo(node.position.x + screenDelta.x, 7)
    expect(next?.position.y).toBeCloseTo(node.position.y + screenDelta.y, 7)
  }
  expect(undo(moved).document).toBe(original)
  expect(redo(undo(moved)).document).toBe(moved.document)
})
