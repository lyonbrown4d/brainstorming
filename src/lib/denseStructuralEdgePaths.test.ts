import { expect, it } from 'vitest'
import {
  ConnectionMode,
  Position,
  getBezierPath,
  getStraightPath,
  type Edge,
  type InternalNode,
} from '@xyflow/react'
import {
  createDenseStructuralEdgeCache,
  denseStructuralEdgeRuns,
} from '@renderer/lib/denseStructuralEdgePaths'

const node = (id: string, x: number): InternalNode => {
  const userNode = { id, position: { x, y: 200 }, data: {} }
  return {
    ...userNode,
    measured: { width: 100, height: 40 },
    internals: {
      positionAbsolute: userNode.position,
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
const source = node('source', 100),
  target = node('target', 400)
const edge: Edge = {
  id: 'edge',
  source: source.id,
  target: target.id,
  sourceHandle: 'source-right',
  targetHandle: 'target-left',
  type: 'default',
  style: { stroke: '#334455', strokeWidth: 2 },
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

it('uses official handle positions and paths, reusing geometry during viewport-only movement', () => {
  const calculate = createDenseStructuralEdgeCache(),
    frame = state()
  const before = calculate(frame, [edge])[0]
  expect(before?.geometry).toEqual({
    sourceX: 204,
    sourceY: 220,
    targetX: 396,
    targetY: 220,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  })
  if (!before) throw new Error('Expected visible initialized edge')
  expect(before.path).toBe(getBezierPath(before.geometry)[0])
  expect(calculate({ ...frame, transform: [10, 20, 1.2] }, [edge])[0]).toBe(before)
  frame.nodeLookup.set(target.id, {
    ...target,
    internals: { ...target.internals, positionAbsolute: { x: 450, y: 230 } },
  })
  const after = calculate(frame, [edge])[0]
  expect(after?.geometry.targetX).toBe(446)
  expect(after?.geometry.targetY).toBe(250)
  expect(after?.path).not.toBe(before.path)
  const straight = calculate(frame, [{ ...edge, type: 'straight' }])[0]
  if (!straight) throw new Error('Expected visible straight edge')
  expect(straight.path).toBe(getStraightPath(straight.geometry)[0])
})

it('culls using the endpoint union, rejects uninitialized ports, and drops removed edges', () => {
  const calculate = createDenseStructuralEdgeCache(),
    frame = state()
  const before = calculate(frame, [edge])[0]
  expect(calculate({ ...frame, width: 100, transform: [-210, -190, 1] }, [edge])).toHaveLength(1)
  expect(calculate({ ...frame, transform: [-1000, -190, 2] }, [edge])).toEqual([])
  expect(calculate({ ...frame, width: 0 }, [edge])).toEqual([])
  expect(calculate(frame, [{ ...edge, targetHandle: 'missing' }])).toEqual([])
  calculate(frame, [])
  expect(calculate(frame, [edge])[0]).not.toBe(before)
  frame.nodeLookup.delete(target.id)
  expect(calculate(frame, [edge])).toEqual([])
})

it('batches only adjacent matching opaque styles and preserves fallback paint order', () => {
  const calculate = createDenseStructuralEdgeCache()
  const edges = [
    edge,
    { ...edge, id: 'second', type: 'straight' },
    { ...edge, id: 'transparent', style: { ...edge.style, opacity: 0.5 } },
    { ...edge, id: 'third' },
    { ...edge, id: 'different', style: { stroke: '#ff0000', strokeWidth: 2 } },
  ]
  const entries = calculate(state(), edges)
  const runs = denseStructuralEdgeRuns(entries, new Set())
  expect(
    runs.map((run) =>
      run.kind === 'batch' ? run.entries.map((entry) => entry.edge.id) : run.entry.edge.id,
    ),
  ).toEqual([['edge', 'second'], 'transparent', ['third'], ['different']])
  const combined = runs[0]
  expect(combined?.kind === 'batch' && combined.entries.map((entry) => entry.path).join(' ')).toBe(
    entries
      .slice(0, 2)
      .map((entry) => entry.path)
      .join(' '),
  )
})

it('keeps drag incident, routed, sketch, custom, and alpha styles as real individual paths', () => {
  const calculate = createDenseStructuralEdgeCache()
  const fallbacks: Edge[] = [
    { ...edge, id: 'routed', type: 'structure', data: { path: 'M0 0L10 10' } },
    { ...edge, id: 'custom', className: 'custom-edge' },
    { ...edge, id: 'aria', ariaLabel: 'Custom accessible description' },
    { ...edge, id: 'marker', markerEnd: 'arrow' },
    { ...edge, id: 'alpha', style: { stroke: '#12345688', strokeWidth: 2 } },
    { ...edge, id: 'css', style: { stroke: 'var(--custom)', strokeWidth: 2 } },
    { ...edge, id: 'data', data: { visualStyle: 'sketch' } },
  ]
  expect(
    denseStructuralEdgeRuns(calculate(state(), fallbacks), new Set()).every(
      (run) => run.kind === 'individual',
    ),
  ).toBe(true)
  expect(denseStructuralEdgeRuns(calculate(state(), [edge]), new Set([target.id]))[0]?.kind).toBe(
    'individual',
  )
  expect(
    calculate(state(), [
      { ...edge, type: 'relation' },
      { ...edge, hidden: true },
    ]),
  ).toEqual([])
})

it('keeps a large subtree move batched instead of recreating hundreds of path wrappers', () => {
  const edges = Array.from({ length: 300 }, (_, index) => ({ ...edge, id: `edge-${index}` }))
  const entries = createDenseStructuralEdgeCache()(state(), edges)
  const moving = new Set([source.id, target.id, ...Array.from({ length: 299 }, (_, i) => `n-${i}`)])
  const runs = denseStructuralEdgeRuns(entries, moving)
  expect(runs).toHaveLength(1)
  expect(runs[0]?.kind === 'batch' && runs[0].entries).toHaveLength(300)
})
