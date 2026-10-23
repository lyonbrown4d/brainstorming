import { expect, it } from 'vitest'
import { ConnectionMode, Position, type Edge, type InternalNode, type Node } from '@xyflow/react'
import { getEdgePosition } from '@xyflow/system'
import { canvasStructuralEdgeGeometry } from '@renderer/lib/canvasStructuralEdgeGeometry'

const node = (id: string, x: number): InternalNode => {
  const userNode: Node = {
    id,
    position: { x, y: 200 },
    data: {},
    measured: { width: 100, height: 40 },
  }
  return {
    ...userNode,
    measured: userNode.measured ?? {},
    internals: {
      positionAbsolute: { x, y: 200 },
      z: 0,
      userNode,
      handleBounds: {
        source: [
          {
            id: 'source-right',
            type: 'source',
            nodeId: id,
            position: Position.Right,
            x: 96,
            y: 17,
            width: 8,
            height: 6,
          },
        ],
        target: [
          {
            id: 'target-left',
            type: 'target',
            nodeId: id,
            position: Position.Left,
            x: -4,
            y: 17,
            width: 8,
            height: 6,
          },
        ],
      },
    },
  }
}
const source = node('source', 100)
const target = node('target', 400)
const edge: Edge = {
  id: 'edge',
  source: source.id,
  target: target.id,
  sourceHandle: 'source-right',
  targetHandle: 'target-left',
}
const state = () => ({
  nodeLookup: new Map([
    [source.id, source],
    [target.id, target],
  ]),
  width: 800,
  height: 600,
  transform: [0, 0, 1] as [number, number, number],
  connectionMode: ConnectionMode.Loose,
})

it('matches official live handle offsets and follows adopted subtree positions', () => {
  const current = state()
  const before = canvasStructuralEdgeGeometry(current, edge)
  expect(before).toEqual({
    sourceX: 204,
    sourceY: 220,
    targetX: 396,
    targetY: 220,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  })
  expect(before).toEqual(
    getEdgePosition({
      id: edge.id,
      sourceNode: source,
      targetNode: target,
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
      connectionMode: current.connectionMode,
    }),
  )
  current.nodeLookup.set(target.id, {
    ...target,
    internals: { ...target.internals, positionAbsolute: { x: 425, y: 240 } },
  })
  expect(canvasStructuralEdgeGeometry(current, edge)).toEqual({
    ...before,
    targetX: 421,
    targetY: 260,
  })
})

it('preserves loose source-to-source ports and rejects missing strict-mode target ports', () => {
  const current = state()
  const looseEdge = { ...edge, targetHandle: 'source-right' }
  expect(canvasStructuralEdgeGeometry(current, looseEdge)?.targetX).toBe(504)
  current.connectionMode = ConnectionMode.Strict
  expect(canvasStructuralEdgeGeometry(current, looseEdge)).toBeNull()
})

it('culls by the transformed endpoint union, retaining edges crossing an empty viewport', () => {
  const current = { ...state(), width: 100, height: 200 }
  current.transform = [-210, -190, 1]
  expect(canvasStructuralEdgeGeometry(current, edge)).not.toBeNull()
  current.transform = [-1000, -190, 2]
  expect(canvasStructuralEdgeGeometry(current, edge)).toBeNull()
  current.transform = [0, 0, 1]
  current.width = 0
  expect(canvasStructuralEdgeGeometry(current, edge)).toBeNull()
})

it('omits edges until both endpoint nodes and their handles are initialized', () => {
  const current = state()
  current.nodeLookup.delete(target.id)
  expect(canvasStructuralEdgeGeometry(current, edge)).toBeNull()
  const internals = { ...target.internals }
  delete internals.handleBounds
  current.nodeLookup.set(target.id, { ...target, internals })
  expect(canvasStructuralEdgeGeometry(current, edge)).toBeNull()
  current.nodeLookup.set(target.id, target)
  expect(canvasStructuralEdgeGeometry(current, edge)).not.toBeNull()
})
