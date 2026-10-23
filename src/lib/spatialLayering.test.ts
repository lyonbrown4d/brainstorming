import { expect, it } from 'vitest'
import { createFixtureDocument } from '@core'
import { layoutDocument, type MindMapLayout } from '@layout'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import { synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import { projectSpatialLayout } from '@renderer/lib/spatialProjection'
import type { SpatialView } from '@renderer/state/spatialView'

const document = createFixtureDocument(2)
const native = layoutDocument(document)
const side: SpatialView = { mode: '3d', yaw: Math.PI / 2, pitch: 0, spacing: 100 }
const opposite: SpatialView = { ...side, yaw: -Math.PI / 2 }
const byId = (nodes: ReturnType<typeof projectCanvas>['nodes'], id: string) => {
  const node = nodes.find((item) => item.id === id)
  if (!node) throw new Error(`Missing ${id}`)
  return node
}

it('draws the camera-nearer card above the farther card when the view reverses', () => {
  const right = projectSpatialLayout(document, native, side)
  const left = projectSpatialLayout(document, native, opposite)
  const rightRoot = right.nodes.find((node) => node.id === 'root')
  const rightBranch = right.nodes.find((node) => node.id === 'topic-1')
  const leftRoot = left.nodes.find((node) => node.id === 'root')
  const leftBranch = left.nodes.find((node) => node.id === 'topic-1')
  expect(rightBranch?.cameraDepth).toBeGreaterThan(rightRoot?.cameraDepth ?? Number.NaN)
  expect(leftBranch?.cameraDepth).toBeLessThan(leftRoot?.cameraDepth ?? Number.NaN)
  const rightNodes = projectCanvas(document, undefined, right).nodes
  const leftNodes = projectCanvas(document, undefined, left).nodes
  expect(byId(rightNodes, 'topic-1').zIndex).toBeGreaterThan(byId(rightNodes, 'root').zIndex ?? -1)
  expect(byId(leftNodes, 'root').zIndex).toBeGreaterThan(byId(leftNodes, 'topic-1').zIndex ?? -1)
  expect(rightNodes.every((node) => (node.zIndex ?? 0) >= 0 && (node.zIndex ?? 0) <= 500)).toBe(
    true,
  )
  expect(native.nodes.every((node) => node.cameraDepth === undefined)).toBe(true)
  const twoD: SpatialView = { mode: '2d', yaw: 0, pitch: 0, spacing: 100 }
  expect(projectSpatialLayout(document, native, twoD)).toBe(native)
  expect(
    projectCanvas(document, undefined, native).nodes.every((node) => node.zIndex === undefined),
  ).toBe(true)
})

it('reissues cached and retained nodes when only their layer changes', () => {
  const makeLayout = (rootDepth: number, branchDepth: number): MindMapLayout => ({
    nodes: [
      { id: 'root', x: 0, y: 0, width: 100, height: 40, side: 'right', cameraDepth: rootDepth },
      {
        id: 'topic-1',
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        side: 'right',
        cameraDepth: branchDepth,
      },
    ],
    edges: [],
  })
  const project = createCanvasProjector()
  const front = project(document, makeLayout(0, 100), undefined, false, side).nodes
  const back = project(document, makeLayout(100, 0), undefined, false, side).nodes
  expect(byId(front, 'topic-1').zIndex).toBe(500)
  expect(byId(back, 'topic-1').zIndex).toBe(0)
  expect(byId(back, 'topic-1')).not.toBe(byId(front, 'topic-1'))
  const state = {
    geometryChanged: false,
    dragging: undefined,
    topics: new Set<string>(),
    drawings: new Set<string>(),
    playing: false,
  }
  const stable = synchronizeCanvasNodes(front, front, state)
  const synced = synchronizeCanvasNodes(stable, back, state)
  expect(synced).not.toBe(stable)
  expect(byId(synced, 'topic-1').zIndex).toBe(0)
  expect(byId(synced, 'root').zIndex).toBe(500)
  const reordered = synchronizeCanvasNodes(synced, [...synced].reverse(), state)
  expect(reordered).not.toBe(synced)
  expect(reordered.map((node) => node.id)).toEqual([...synced].reverse().map((node) => node.id))
  expect(reordered[0]).toBe(synced.at(-1))
})

it('keeps fractional perspective scaling while matching RF integer wrapper measurements', () => {
  const layout: MindMapLayout = {
    nodes: [
      {
        id: 'root',
        x: 10.25,
        y: 20.75,
        width: 107.24,
        height: 42.19,
        side: 'right',
        cameraScale: 1.0724,
        cameraDepth: 100,
        worldWidth: 100,
        worldHeight: 42.19 / 1.0724,
      },
    ],
    edges: [],
  }
  const topic = projectCanvas(document, undefined, layout).nodes[0]
  expect(topic?.style).toEqual({ width: 107, height: 42 })
  expect(topic?.measured).toEqual({ width: 107, height: 42 })
  expect(topic?.position).toEqual({ x: 10.25, y: 20.75 })
  expect(topic?.data.cameraScale).toBe(1.0724)
  const twoD = projectCanvas(document, undefined, {
    nodes: [{ id: 'root', x: 0, y: 0, width: 107.24, height: 42.19, side: 'right' }],
    edges: [],
  }).nodes[0]
  expect(twoD?.style).toEqual({ width: 107.24, height: 42.19 })
})
