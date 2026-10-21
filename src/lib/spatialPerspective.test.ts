import { expect, it } from 'vitest'
import { createFixtureDocument } from '@core'
import type { MindMapLayout } from '@layout'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { previewPerspectiveDrag } from '@renderer/lib/canvasPerspectiveDrag'
import { projectInk } from '@renderer/lib/canvasNodes'
import { projectSpatialLayout } from '@renderer/lib/spatialProjection'
import { spatialDepthVisible } from '@renderer/lib/spatialCamera'
import { getSpatialView } from '@renderer/state/spatialView'
import { setSpatialLens, withSpatialLens } from '@renderer/state/spatialLens'
import type { SpatialView } from '@renderer/state/spatialView'

const view: SpatialView = {
  mode: '3d',
  yaw: 0,
  pitch: 0,
  spacing: 100,
  cameraDistance: 1000,
}

it('scales near and far topic billboards and decorations without altering canonical layout', () => {
  const document = createFixtureDocument(3)
  const native: MindMapLayout = {
    nodes: [
      { id: 'root', x: 100, y: 50, width: 150, height: 60, side: 'right' },
      { id: 'topic-1', x: 400, y: 80, width: 120, height: 50, side: 'right' },
    ],
    edges: [],
    decorations: [
      { id: 'frame', kind: 'brace', topicId: 'root', x: 100, y: 50, width: 150, height: 60 },
    ],
  }
  const projected = projectSpatialLayout(document, native, view, { root: 250, 'topic-1': -250 })
  expect(projected.nodes[0]?.cameraScale).toBeCloseTo(4 / 3)
  expect(projected.nodes[0]?.width).toBeCloseTo(200)
  const zoomed = projectSpatialLayout(
    document,
    native,
    { ...view, cameraDistance: 600 },
    { root: 250 },
  )
  expect(zoomed.nodes[0]?.width).not.toBeCloseTo(projected.nodes[0]?.width ?? 0)
  expect([projected.nodes[0]?.worldWidth, zoomed.nodes[0]?.worldWidth]).toEqual([150, 150])
  expect([projected.nodes[0]?.worldHeight, zoomed.nodes[0]?.worldHeight]).toEqual([60, 60])
  expect(projected.nodes[0]?.x).toBeCloseTo(133.333333)
  expect(projected.nodes[1]?.cameraScale).toBeCloseTo(0.8)
  expect(projected.nodes[1]?.width).toBeCloseTo(96)
  expect(projected.decorations?.[0]?.width).toBeCloseTo(200)
  expect(native.nodes[0]?.width).toBe(150)
})

it('previews one world drag at each node depth using its own screen scale', () => {
  const nodes = [
    { id: 'near', position: { x: 10, y: 20 } },
    { id: 'far', position: { x: 30, y: 40 } },
  ] as CanvasFlowNode[]
  const origins = new Map(nodes.map((node) => [node.id, node.position]))
  const result = previewPerspectiveDrag(
    nodes,
    { excluded: new Set(['near', 'far']), origins, view, anchorId: 'near' },
    new Map([
      ['near', 250],
      ['far', -250],
    ]),
    100,
    -50,
  )
  expect(result[0]?.position).toEqual({ x: 110, y: -30 })
  expect(result[1]?.position.x).toBeCloseTo(90)
  expect(result[1]?.position.y).toBeCloseTo(10)
})

it('culls cards, incident edges, decorations, and ink behind the near plane', () => {
  const original = createFixtureDocument(3)
  const document = {
    ...original,
    drawings: [
      {
        id: 'hidden-stroke',
        color: '#333333',
        width: 2,
        spatialDepth: 1000,
        points: [
          { x: 10, y: 10, pressure: 1 },
          { x: 20, y: 20, pressure: 1 },
        ],
      },
    ],
  }
  const native: MindMapLayout = {
    nodes: [
      { id: 'root', x: 0, y: 0, width: 100, height: 50, side: 'right' },
      { id: 'topic-1', x: 200, y: 0, width: 100, height: 50, side: 'right' },
    ],
    edges: [{ id: 'link', source: 'root', target: 'topic-1' }],
    decorations: [
      {
        id: 'hidden-brace',
        kind: 'brace',
        topicId: 'topic-1',
        x: 200,
        y: 0,
        width: 100,
        height: 50,
      },
    ],
  }
  const projected = projectSpatialLayout(document, native, view, { root: 0, 'topic-1': 900 })
  expect(projected.nodes.map((node) => node.id)).toEqual(['root'])
  expect(projected.edges).toEqual([])
  expect(projected.decorations).toEqual([])
  expect(projectInk(document, view)).toEqual([])
  expect(native.nodes).toHaveLength(2)
  // A scene-sized camera may sit beyond the old fixed far plane when viewing a large map.
  expect(spatialDepthVisible({ ...view, cameraDistance: 100_000_000 }, 0)).toBe(true)
  expect(
    projectSpatialLayout(document, native, view, { root: 0, 'topic-1': -200_000 }).nodes,
  ).toHaveLength(1)
})

it('keeps renderer lens scoped and merged views referentially stable', () => {
  const base: SpatialView = { mode: '3d', yaw: 0, pitch: 0, spacing: 100 }
  expect(withSpatialLens(base, 1000)).toBe(withSpatialLens(base, 1000))
  expect(withSpatialLens(base)).toBe(base)
  setSpatialLens('perspective-book', 'sheet-a', 1000)
  const first = getSpatialView('perspective-book', 'sheet-a')
  expect(first.cameraDistance).toBe(1000)
  expect(getSpatialView('perspective-book', 'sheet-a')).toBe(first)
  setSpatialLens('perspective-book', 'sheet-a', 1000 + 1e-9)
  expect(getSpatialView('perspective-book', 'sheet-a')).toBe(first)
  setSpatialLens('perspective-book', 'sheet-a', 1000.01)
  expect(getSpatialView('perspective-book', 'sheet-a').cameraDistance).toBe(1000.01)
  expect(getSpatialView('perspective-book', 'sheet-b').cameraDistance).toBeUndefined()
  setSpatialLens('perspective-book', 'sheet-a', undefined)
  expect(getSpatialView('perspective-book', 'sheet-a').cameraDistance).toBeUndefined()
})
