import { expect, it } from 'vitest'
import { createFixtureDocument, type MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { projectSpatialPoint } from '@renderer/lib/spatialCamera'
import { canvasMoveCommand } from '@renderer/lib/canvasGesture'
import {
  captureSpatialOrigins,
  projectSpatialLayout,
  spatialTopicOffset,
  spatialTopicOffsets,
} from '@renderer/lib/spatialProjection'
import {
  DEFAULT_SPATIAL_VIEW,
  getSpatialView,
  useSpatialView,
  type SpatialView,
} from '@renderer/state/spatialView'

const view: SpatialView = { mode: '3d', yaw: 0.7, pitch: 0.5, spacing: 100 }
const documentWithDepth = (): MindMapDocument => {
  const original = createFixtureDocument(6)
  const root = original.topics.root
  const branch = original.topics['topic-1']
  if (!root || !branch) throw new Error('missing fixture topic')
  return {
    ...original,
    topics: {
      ...original.topics,
      root: { ...root, style: { spatialDepth: 20 } },
      'topic-1': { ...branch, style: { spatialDepth: 15 } },
    },
  }
}

it('uses one inherited depth per topic and centers first-level branches', () => {
  const document = documentWithDepth()
  const offsets = spatialTopicOffsets(document, view)
  expect(offsets.get('root')?.z).toBe(20)
  expect(offsets.get('topic-1')?.z).toBe(30)
  expect(offsets.get('topic-5')?.z).toBe(130)
  expect(offsets.get('topic-2')?.z).toBe(85)
  expect(offsets.get('topic-5')).toEqual({ x: 0, y: 0, z: 130 })
  expect(spatialTopicOffset(document, 'missing', view)).toEqual({ x: 0, y: 0, z: 0 })
})

it('treats a floating root as a separate tree and ignores cycles', () => {
  const original = documentWithDepth()
  const document: MindMapDocument = { ...original, floatingIds: ['topic-2'] }
  expect(spatialTopicOffset(document, 'topic-2', view).z).toBe(0)
  expect(spatialTopicOffset(document, 'topic-1', view).z).toBe(65)
  const root = document.topics.root
  const child = document.topics['topic-5']
  if (!root || !child) throw new Error('missing fixture topic')
  const malformed = {
    ...document,
    topics: { ...document.topics, 'topic-5': { ...child, children: ['root'] } },
  }
  expect(spatialTopicOffsets(malformed, view).size).toBe(6)
})

it('translates centers, edge waypoints, and decorations without changing sizes or ink', () => {
  const document: MindMapDocument = {
    ...documentWithDepth(),
    drawings: [
      {
        id: 'stroke-1',
        color: '#333333',
        width: 2,
        points: [
          { x: 10, y: 20, pressure: 1 },
          { x: 20, y: 30, pressure: 1 },
        ],
      },
    ],
  }
  const layout: MindMapLayout = {
    nodes: [
      { id: 'root', x: 0, y: 0, width: 200, height: 80, side: 'right' },
      { id: 'topic-1', x: 300, y: 100, width: 100, height: 50, side: 'right' },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'root',
        target: 'topic-1',
        waypoints: [
          { x: 100, y: 40 },
          { x: 200, y: 100 },
          { x: 350, y: 125 },
        ],
      },
    ],
    decorations: [
      {
        id: 'decoration',
        kind: 'brace',
        x: 300,
        y: 100,
        width: 100,
        height: 50,
        topicId: 'topic-1',
      },
    ],
  }
  const projected = projectSpatialLayout(document, layout, view)
  const rootDepth = spatialTopicOffset(document, 'root', view).z
  const branchDepth = spatialTopicOffset(document, 'topic-1', view).z
  const branchCenter = projectSpatialPoint({ x: 350, y: 125, z: branchDepth }, view)
  expect(projected.nodes[1]).toMatchObject({
    x: branchCenter.x - 50,
    y: branchCenter.y - 25,
    width: 100,
    height: 50,
  })
  const expectedWaypoints = [
    projectSpatialPoint({ x: 100, y: 40, z: rootDepth }, view),
    projectSpatialPoint({ x: 200, y: 100, z: (rootDepth + branchDepth) / 2 }, view),
    projectSpatialPoint({ x: 350, y: 125, z: branchDepth }, view),
  ]
  projected.edges[0]?.waypoints?.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expectedWaypoints[index]?.x ?? Number.NaN)
    expect(point.y).toBeCloseTo(expectedWaypoints[index]?.y ?? Number.NaN)
  })
  expect(projected.decorations?.[0]?.x).toBeCloseTo(branchCenter.x - 50)
  expect(projected.decorations?.[0]?.y).toBeCloseTo(branchCenter.y - 25)
  const nativeInk = projectCanvas(document, undefined, layout).nodes.find(
    (node) => node.type === 'ink',
  )
  const spatialInk = projectCanvas(document, undefined, projected).nodes.find(
    (node) => node.type === 'ink',
  )
  expect(spatialInk).toEqual(nativeInk)
  expect(layout.nodes[1]?.x).toBe(300)
})

it('uses native depth records without traversing the topic tree', () => {
  const document = documentWithDepth()
  const layout: MindMapLayout = {
    nodes: [{ id: 'topic-1', x: 300, y: 100, width: 100, height: 50, side: 'right' }],
    edges: [],
  }
  const projected = projectSpatialLayout(document, layout, view, { 'topic-1': 300 })
  const center = projectSpatialPoint({ x: 350, y: 125, z: 300 }, view)
  expect(projected.nodes[0]?.x).toBeCloseTo(center.x - 50)
  expect(projected.nodes[0]?.y).toBeCloseTo(center.y - 25)
  expect(spatialTopicOffset(document, 'topic-1', view, { 'topic-1': 300 }).z).toBe(300)
})

it('keeps native origins for mixed topic and ink movement', () => {
  const document: MindMapDocument = {
    ...documentWithDepth(),
    drawings: [
      {
        id: 'stroke-1',
        color: '#333333',
        width: 2,
        points: [
          { x: 10, y: 20, pressure: 1 },
          { x: 20, y: 30, pressure: 1 },
        ],
      },
    ],
  }
  const layout: MindMapLayout = {
    nodes: [{ id: 'topic-1', x: 300, y: 100, width: 100, height: 50, side: 'right' }],
    edges: [],
  }
  const projected = projectSpatialLayout(document, layout, view)
  const node = projected.nodes[0]
  if (!node) throw new Error('missing projected topic')
  const ink = projectCanvas(document, undefined, layout).nodes.find((item) => item.type === 'ink')
  if (!ink) throw new Error('missing ink node')
  const { origins, nativeOrigins } = captureSpatialOrigins(
    document,
    view,
    [{ id: 'topic-1', position: { x: node.x, y: node.y } }, ink],
    undefined,
    layout,
  )
  expect(origins.get('topic-1')).toEqual({ x: node.x, y: node.y })
  expect(nativeOrigins.get('topic-1')?.x).toBeCloseTo(300)
  expect(nativeOrigins.get('topic-1')?.y).toBeCloseTo(100)
  expect(nativeOrigins.get(ink.id)).toEqual(ink.position)
  const command = canvasMoveCommand(document, ['topic-1'], ['stroke-1'], nativeOrigins, {
    x: 40,
    y: -20,
  })
  expect(command).toMatchObject({
    type: 'batch',
    commands: [
      {
        type: 'batch',
        commands: [
          { type: 'setTopicStyle', topicId: 'topic-1', style: { offsetX: 40, offsetY: -20 } },
        ],
      },
      { type: 'upsertDrawing' },
    ],
  })
})

it('uses a native floating origin for a depth-shifted floating topic', () => {
  const document: MindMapDocument = {
    ...documentWithDepth(),
    floatingIds: ['topic-1'],
    floatingPositions: { 'topic-1': { x: 300, y: 100 } },
  }
  const layout: MindMapLayout = {
    nodes: [{ id: 'topic-1', x: 300, y: 100, width: 100, height: 50, side: 'right' }],
    edges: [],
  }
  const projected = projectSpatialLayout(document, layout, view)
  const node = projected.nodes[0]
  if (!node) throw new Error('missing projected topic')
  const { nativeOrigins } = captureSpatialOrigins(
    document,
    view,
    [{ id: 'topic-1', position: { x: node.x, y: node.y } }],
    undefined,
    layout,
  )
  const command = canvasMoveCommand(document, ['topic-1'], [], nativeOrigins, { x: 40, y: -20 })
  expect(command).toMatchObject({
    type: 'batch',
    commands: [
      {
        type: 'batch',
        commands: [{ type: 'setFloatingPosition', topicId: 'topic-1', x: 340, y: 80 }],
      },
    ],
  })
})

it('returns the exact native layout in 2D and scopes bounded view state', () => {
  const document = documentWithDepth()
  const layout: MindMapLayout = { nodes: [], edges: [] }
  expect(projectSpatialLayout(document, layout, DEFAULT_SPATIAL_VIEW)).toBe(layout)
  expect(spatialTopicOffset(document, 'topic-1', DEFAULT_SPATIAL_VIEW)).toEqual({
    x: 0,
    y: 0,
    z: 0,
  })
  const before = getSpatialView('book-a', 'sheet-a')
  expect(before).toBe(getSpatialView('book-a', 'sheet-a'))
  useSpatialView.getState().setView('book-a', 'sheet-a', {
    mode: '3d',
    yaw: 100,
    pitch: -100,
    spacing: 1000,
  })
  expect(getSpatialView('book-a', 'sheet-a')).toEqual({
    mode: '3d',
    yaw: Math.PI,
    pitch: -Math.PI / 2,
    spacing: 200,
  })
  const bounded = getSpatialView('book-a', 'sheet-a')
  useSpatialView.getState().setView('book-a', 'sheet-a', { yaw: Number.NaN })
  expect(getSpatialView('book-a', 'sheet-a')).toBe(bounded)
  expect(getSpatialView('book-b', 'sheet-a')).toBe(before)
})
