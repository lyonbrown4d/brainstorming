import { expect, it } from 'vitest'
import type { InternalNode } from '@xyflow/react'
import { structuralEdgeTranslation } from '@renderer/lib/structuralEdgeTranslation'

const node = (id: string, x: number): InternalNode => {
  const userNode = { id, data: {}, position: { x, y: 20 } }
  return {
    ...userNode,
    measured: { width: 100, height: 40 },
    internals: {
      positionAbsolute: userNode.position,
      z: 0,
      userNode,
      handleBounds: { source: [], target: [] },
    },
  }
}
const move = (node: InternalNode, x: number, y: number): InternalNode => ({
  ...node,
  internals: {
    ...node.internals,
    positionAbsolute: {
      x: node.internals.positionAbsolute.x + x,
      y: node.internals.positionAbsolute.y + y,
    },
  },
})
const root = node('root', 0)
const before = [root, node('child', 200)]

it('retains relative curves for rigid movement including return to the origin', () => {
  expect(
    structuralEdgeTranslation(
      before,
      before.map((node) => move(node, 120, -70)),
    ),
  ).toEqual([120, -70])
  expect(structuralEdgeTranslation(before, before)).toEqual([0, 0])
})
it('rejects local movement so incident curves update normally', () => {
  expect(
    structuralEdgeTranslation(
      before,
      before.map((node, index) => move(node, index * 10, 0)),
    ),
  ).toBeNull()
})
it('invalidates reuse when dimensions, ports or content change during a gesture', () => {
  for (const changed of [
    { ...root, measured: { width: 150, height: 40 } },
    { ...root, data: {} },
    {
      ...root,
      internals: { ...root.internals, handleBounds: { source: [], target: [] } },
    },
  ])
    expect(structuralEdgeTranslation(before, [changed, before[1]])).toBeNull()
})
it('rejects missing endpoints, reordered IDs, and invalid coordinates', () => {
  expect(structuralEdgeTranslation([], [])).toBeNull()
  expect(structuralEdgeTranslation(before, [before[0]])).toBeNull()
  expect(structuralEdgeTranslation(before, [undefined, before[1]])).toBeNull()
  expect(structuralEdgeTranslation(before, before.toReversed())).toBeNull()
  expect(
    structuralEdgeTranslation(
      before,
      before.map((node) => move(node, NaN, 0)),
    ),
  ).toBeNull()
  expect(structuralEdgeTranslation(before, [root, move(before[1] ?? root, Infinity, 0)])).toBeNull()
})
