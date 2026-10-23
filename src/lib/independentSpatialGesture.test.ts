import { independentSpatialInkIdentity } from '@renderer/lib/independentSpatialInkIdentity'
import { independentSpatialFloatingCommand } from '@renderer/lib/independentSpatialGestureActions'
import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { applyCommand, createDocument, createHistory, executeCommand, undo } from '@core'
import { layoutDocument } from '@layout'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { independentSpatialMove } from '@renderer/lib/independentSpatialGestureSession'
import {
  independentSpatialMarqueeSelection,
  independentSpatialPointerPlane,
} from '@renderer/lib/independentSpatialGestureGeometry'
import { independentSpatialInkPlane } from '@renderer/lib/independentSpatialGestureInk'
import { inkGeometry } from '@shared/ink-geometry'

const fixture = () => {
  const document = applyCommand(createDocument('Spatial gesture'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'branch', title: 'Branch' },
      { type: 'addTopic', parentId: 'branch', id: 'child', title: 'Child' },
      {
        type: 'upsertDrawing',
        stroke: {
          id: 'stroke-a',
          color: '#334455',
          width: 4,
          points: [
            { x: 400, y: 100, pressure: 0.5 },
            { x: 430, y: 150, pressure: 0.7 },
          ],
        },
      },
    ],
  })
  return createIndependentSpatialRuntime({
    document,
    layout: layoutDocument(document),
    depths: {},
    surface: '#fff',
  })
}

it('previews a whole branch and selected ink, then moves them with one undo entry', () => {
  const runtime = fixture(),
    original = runtime.model.document
  const move = independentSpatialMove(runtime, ['branch', 'child'], ['stroke-a'])
  expect(move.roots).toEqual(['branch'])
  expect(move.canDrop).toBe(false)
  move.preview({ x: 45, y: -20, z: 35 })
  expect([...runtime.offsets.keys()].sort()).toEqual(['branch', 'child', 'ink-stroke-a'])
  expect(runtime.model.document).toBe(original)
  const command = move.finish({ targetId: 'root', parentId: 'root', side: 'left' })
  if (!command) throw new Error('Missing mixed move command')
  const history = executeCommand(createHistory(original), command)
  expect(history.past).toHaveLength(1)
  expect(history.document.topics.branch?.style).toMatchObject({
    offsetX: 45,
    offsetY: -20,
    spatialDepth: 35,
  })
  expect(history.document.topics.branch?.children).toEqual(['child'])
  const originalStroke = original.drawings?.[0],
    movedStroke = history.document.drawings?.[0]
  if (!originalStroke || !movedStroke) throw new Error('Missing mixed move ink')
  const before = inkGeometry(originalStroke).bounds,
    after = inkGeometry(movedStroke).bounds
  expect(after.x).toBeCloseTo(before.x + 45)
  expect(after.y).toBeCloseTo(before.y - 20)
  expect(movedStroke.spatialDepth).toBe(35)
  expect(move.finish()).toBeUndefined()
  expect(undo(history).document).toBe(original)
})

it('cancels preview without producing a command or changing the document', () => {
  const runtime = fixture(),
    original = runtime.model.document
  const move = independentSpatialMove(runtime, ['branch'], [])
  move.preview({ x: 100, y: 30, z: -20 })
  runtime.dropTarget = 'root'
  move.cancel()
  expect(runtime.offsets.size).toBe(0)
  expect(runtime.dropTarget).toBeNull()
  expect(move.finish()).toBeUndefined()
  expect(runtime.model.document).toBe(original)
})

it('maps pointer movement onto a fixed camera plane under an oblique perspective', () => {
  const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 10000)
  camera.position.set(600, 400, 1000)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const viewport = { left: 80, top: 40, width: 800, height: 600 }
  const plane = independentSpatialPointerPlane(camera, viewport, { x: 0, y: 0, z: 0 })
  const start = plane({ x: 480, y: 340 }),
    end = plane({ x: 555, y: 310 })
  if (!start || !end) throw new Error('Missing plane hit')
  const physical = new Vector3(end.x - start.x, -(end.y - start.y), end.z - start.z)
  expect(physical.dot(camera.getWorldDirection(new Vector3()))).toBeCloseTo(0, 8)
  const projected = new Vector3(end.x, -end.y, end.z).project(camera)
  expect(viewport.left + ((projected.x + 1) * viewport.width) / 2).toBeCloseTo(555)
  expect(viewport.top + ((1 - projected.y) * viewport.height) / 2).toBeCloseTo(310)
  expect(
    independentSpatialPointerPlane(
      camera,
      { ...viewport, width: 0 },
      { x: 0, y: 0, z: 0 },
    )({ x: 0, y: 0 }),
  ).toBeNull()
})

it('marquee intersects topic and ink rectangles while preserving the stroke ID', () => {
  expect(
    independentSpatialMarqueeSelection(
      [
        { id: 'branch', kind: 'topic', x: 20, y: 20, width: 50, height: 20, depth: 100 },
        {
          id: 'ink-stroke-a',
          kind: 'ink',
          drawingId: 'stroke-a',
          x: 80,
          y: 30,
          width: 20,
          height: 20,
          depth: 80,
        },
        { id: 'outside', kind: 'topic', x: 200, y: 200, width: 20, height: 20, depth: 90 },
      ],
      { x: 40, y: 25, width: 55, height: 15 },
    ),
  ).toEqual({ topics: ['branch'], drawings: ['stroke-a'] })
})

it('places a drawn billboard at the exact camera-plane center after an oblique stroke', () => {
  const camera = new PerspectiveCamera(50, 1, 0.1, 10000)
  camera.position.set(600, 400, 1000)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const plane = independentSpatialInkPlane(
    camera,
    { left: 0, top: 0, width: 600, height: 600 },
    { x: 0, y: 0, z: 0 },
  )
  const points = [plane.point({ x: 330, y: 280 }, 0.5), plane.point({ x: 400, y: 350 }, 0.7)]
  if (!points[0] || !points[1]) throw new Error('Missing ink plane hit')
  const stroke = plane.stroke({
    id: 'drawn',
    color: '#334455',
    width: 4,
    points: [points[0], points[1]],
  })
  if (!stroke) throw new Error('Missing placed ink')
  const bounds = inkGeometry(stroke).bounds
  const center = new Vector3(
    bounds.x + bounds.width / 2,
    -bounds.y - bounds.height / 2,
    stroke.spatialDepth,
  )
  expect(center.dot(camera.getWorldDirection(new Vector3()))).toBeCloseTo(0, 7)
  expect(stroke.spatialDepth).not.toBe(0)
  expect(stroke.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
    true,
  )
  expect(plane.stroke({ ...stroke, points: [{ x: 1e12, y: 1e12, pressure: 0.5 }] })).toBeNull()
})

it('creates a floating topic and its relation at the Three world plane in one undo entry', () => {
  const original = createDocument('Floating')
  const command = independentSpatialFloatingCommand('floating', 'Idea', { x: 350, y: -120, z: 85 })
  const history = executeCommand(createHistory(original), {
    type: 'batch',
    commands: [
      command,
      {
        type: 'upsertRelation',
        relation: {
          id: 'relation',
          from: original.rootId,
          to: 'floating',
          title: 'Related',
          arrow: 'end',
        },
      },
    ],
  })
  const node = layoutDocument(history.document).nodes.find((item) => item.id === 'floating')
  if (!node) throw new Error('Missing floating topic layout')
  expect(node.x + node.width / 2).toBeCloseTo(350)
  expect(node.y + node.height / 2).toBeCloseTo(-120)
  expect(history.document.topics.floating?.style?.spatialDepth).toBe(85)
  expect(history.document.relations?.[0]).toMatchObject({ from: original.rootId, to: 'floating' })
  expect(history.past).toHaveLength(1)
  expect(undo(history).document).toBe(original)
})

it('keeps colliding topic and ink identities distinct through picking, mixed moves and resizing', () => {
  const original = fixture().model.document
  const document = applyCommand(original, {
    type: 'addTopic',
    parentId: 'root',
    id: 'ink-stroke-a',
    title: 'Legal topic ID',
  })
  const runtime = createIndependentSpatialRuntime({
    document,
    layout: layoutDocument(document),
    depths: {},
    surface: '#fff',
  })
  const identity = independentSpatialInkIdentity(document)
  const key = identity.byDrawing.get('stroke-a')
  if (!key) throw new Error('Missing ink identity')
  expect(key).not.toBe('ink-stroke-a')
  expect(identity.byKey.get(key)).toBe('stroke-a')
  expect(independentSpatialInkIdentity(document)).toBe(identity)
  runtime.camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 10000)
  runtime.camera.position.set(0, 0, 1500)
  runtime.camera.lookAt(0, 0, 0)
  runtime.camera.updateMatrixWorld()
  runtime.canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
  } as HTMLCanvasElement
  const topic = runtime.rectangle('ink-stroke-a'),
    ink = runtime.rectangle(key)
  if (!topic || !ink) throw new Error('Both colliding identities must remain projected')
  expect(topic.kind).toBe('topic')
  expect(ink).toMatchObject({ kind: 'ink', drawingId: 'stroke-a' })
  expect(runtime.pick(topic.x + topic.width / 2, topic.y + topic.height / 2)?.id).toBe(topic.id)
  expect(runtime.pick(ink.x + ink.width / 2, ink.y + ink.height / 2)?.id).toBe(key)
  const move = independentSpatialMove(runtime, ['ink-stroke-a'], ['stroke-a'])
  move.preview({ x: 30, y: 20, z: 0 })
  expect([...runtime.offsets.keys()].sort()).toEqual(['ink-stroke-a', key].sort())
  expect(runtime.rectangle(topic.id)?.x).not.toBe(topic.x)
  expect(runtime.rectangle(key)?.x).not.toBe(ink.x)
  move.cancel()
  const stroke = document.drawings?.[0]
  if (!stroke) throw new Error('Missing stroke')
  const bounds = inkGeometry(stroke).bounds
  runtime.inkPreviews.set(key, { ...bounds, width: bounds.width * 2 })
  expect(runtime.rectangle(key)?.width).toBeCloseTo(ink.width * 2)
  expect(runtime.rectangle(topic.id)).toEqual(topic)
  expect(document.topics['ink-stroke-a']?.id).toBe('ink-stroke-a')
})

it('clears transient geometry on model replacement even without mounted gesture listeners', () => {
  const runtime = fixture()
  runtime.offsets.set('branch', { x: 85, y: 35, z: 10 })
  runtime.scales.set('branch', 1.5)
  runtime.inkPreviews.set('ink-stroke-a', { x: 1, y: 2, width: 30, height: 40 })
  runtime.updateModel({ ...runtime.model })
  expect(runtime.offsets.size).toBe(0)
  expect(runtime.scales.size).toBe(0)
  expect(runtime.inkPreviews.size).toBe(0)
})
