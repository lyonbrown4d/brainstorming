import { describe, expect, it } from 'vitest'
import type { MindMapLayout } from '@layout'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { SpatialView } from '@renderer/state/spatialView'
import {
  stageDepthSegments,
  stageFloorDepth,
} from '@renderer/components/spatial/spatialStageGeometry'

const view: SpatialView = { mode: '2d', yaw: 0, pitch: 0, spacing: 100 }

const layout: MindMapLayout = {
  nodes: [
    { id: 'near', x: 10, y: 20, width: 100, height: 40, side: 'right' },
    { id: 'far', x: 1000, y: 1000, width: 100, height: 40, side: 'right' },
  ],
  edges: [],
}
const topicNode = (id: string, x: number, y: number): CanvasFlowNode =>
  ({
    id,
    type: 'topic',
    position: { x, y },
    measured: { width: 100, height: 40 },
  }) as CanvasFlowNode

describe('spatial stage geometry', () => {
  it('places the floor behind the lowest topic', () => {
    expect(stageFloorDepth(layout, { near: 120, far: 40 })).toBe(-80)
    expect(stageFloorDepth(layout, { near: -35, far: 40 })).toBe(-115)
    expect(stageFloorDepth({ nodes: [], edges: [] }, {})).toBe(-80)
  })

  it('emits one physical-world depth line per visible topic', () => {
    const lines = stageDepthSegments(
      layout,
      { near: 120, far: 40 },
      [topicNode('near', 10, 20), topicNode('far', 1000, 1000)],
      { x: 0, y: 0, zoom: 1 },
      { width: 500, height: 300 },
      -40,
      view,
    )
    expect(Array.from(lines)).toEqual([60, -40, -40, 60, -40, 120])
  })

  it('bounds segment count even when many topics are visible', () => {
    const many = Array.from({ length: 150 }, (_, index) => ({
      id: `topic-${index}`,
      x: index,
      y: 0,
      width: 20,
      height: 20,
      side: 'right' as const,
    }))
    const lines = stageDepthSegments(
      { nodes: many, edges: [] },
      {},
      many.map((node) => topicNode(node.id, node.x, node.y)),
      { x: 0, y: 0, zoom: 1 },
      { width: 1000, height: 300 },
      -80,
      view,
    )
    expect(lines.length).toBe(128 * 6)
  })

  it('moves the floor anchor with a projected drag preview', () => {
    const rotated: SpatialView = { mode: '3d', yaw: 0.5, pitch: 0.4, spacing: 100 }
    const nodes = [topicNode('near', 10, 20)]
    const args = [
      layout,
      { near: 120 },
      nodes,
      { x: 0, y: 0, zoom: 1 },
      { width: 500, height: 300 },
      -80,
      rotated,
    ] as const
    const before = stageDepthSegments(...args)
    nodes[0] = topicNode('near', 45, 45)
    const after = stageDepthSegments(...args)
    expect(after[0]).not.toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(after[0]).toBe(after[3])
    expect(after[1]).toBe(after[4])
    expect(after[2]).toBe(-80)
    expect(after[5]).not.toBe(before[5])
  })
})
