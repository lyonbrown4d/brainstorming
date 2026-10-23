import { expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  canBatchCanvasMinimap,
  canvasMinimapPathGroups,
  canvasMinimapRectanglePath,
  canvasMinimapRectangles,
  type MinimapLookup,
  type MinimapRectangle,
} from '@renderer/lib/canvasMinimapBatch'

const node = (id: string, patch: Partial<Node> = {}): Node => ({
  id,
  position: { x: 1, y: 2 },
  data: { color: '#123456' },
  measured: { width: 40, height: 20 },
  ...patch,
})
const colorOf = (item: Node): string => (typeof item.data.color === 'string' ? item.data.color : '')
const rectangle = (item: Node, x = -12.375): MinimapRectangle => ({
  node: item,
  x,
  y: 5.625,
  width: 40,
  height: 20,
})

it('uses adopted absolute coordinates and official dimension precedence, excluding invisible geometry', () => {
  const nodes = [
    node('nested', { parentId: 'parent', width: 90, height: 80 }),
    node('initial', { measured: {}, initialWidth: 30, initialHeight: 15 }),
    node('hidden', { hidden: true }),
    node('unmeasured', { measured: {} }),
    node('zero', { measured: { width: 0, height: 5 } }),
    node('invalid', { measured: { width: Number.NaN, height: 5 } }),
    node('missing'),
  ]
  const lookup: MinimapLookup = new Map(
    nodes
      .slice(0, -1)
      .map((item) => [
        item.id,
        { internals: { userNode: item, positionAbsolute: { x: -17.125, y: 25.875 } } },
      ]),
  )
  const visible = canvasMinimapRectangles(nodes, lookup)
  expect(visible).toEqual([
    { node: nodes[0], x: -17.125, y: 25.875, width: 40, height: 20 },
    { node: nodes[1], x: -17.125, y: 25.875, width: 30, height: 15 },
  ])
})

it('preserves fractional geometry and caps both rounded axes exactly like SVG rectangles', () => {
  const bounds = { x: -12.375, y: 5.625, width: 10, height: 40 }
  expect(canvasMinimapRectanglePath(bounds, 20)).toBe(
    'M-7.375,5.625H-7.375A5,20 0 0 1 -2.375,25.625' +
      'V25.625A5,20 0 0 1 -7.375,45.625H-7.375A5,20 0 0 1 -12.375,25.625' +
      'V25.625A5,20 0 0 1 -7.375,5.625Z',
  )
  expect(canvasMinimapRectanglePath(bounds, -1)).toBe('M-12.375,5.625H-2.375V45.625H-12.375Z')
})

it('groups every node once by resolved fill and selection while keeping callback and style fallbacks', () => {
  const rectangles = [
    rectangle(node('a')),
    rectangle(node('b'), 100.125),
    rectangle(node('selected', { selected: true })),
    rectangle(node('background', { data: {}, style: { background: '#abcdef' } })),
    rectangle(node('backgroundColor', { data: {}, style: { backgroundColor: '#fedcba' } })),
  ]
  const groups = canvasMinimapPathGroups(rectangles, colorOf, 0)
  if (!groups) throw new Error('Expected opaque groups')
  expect(groups.map(({ fill, selected, count }) => ({ fill, selected, count }))).toEqual([
    { fill: '#123456', selected: false, count: 2 },
    { fill: '#123456', selected: true, count: 1 },
    { fill: '#abcdef', selected: false, count: 1 },
    { fill: '#fedcba', selected: false, count: 1 },
  ])
  expect(groups.reduce((count, group) => count + (group.path.match(/M/g)?.length ?? 0), 0)).toBe(5)
  expect(groups[0]?.path).toContain('M100.125,5.625H140.125')
  expect(canvasMinimapPathGroups(rectangles, '#777777', 0)?.map((group) => group.count)).toEqual([
    2, 1, 2,
  ])
})

it('keeps nonadjacent colors separate and falls back for translucent or unresolved fills', () => {
  const rectangles = [
    rectangle(node('first')),
    rectangle(node('middle', { data: { color: '#abcdef' } })),
    rectangle(node('last')),
  ]
  const groups = canvasMinimapPathGroups(rectangles, colorOf)
  expect(groups?.map(({ id, fill, count }) => ({ id, fill, count }))).toEqual([
    { id: 'first', fill: '#123456', count: 1 },
    { id: 'middle', fill: '#abcdef', count: 1 },
    { id: 'last', fill: '#123456', count: 1 },
  ])
  for (const fill of [
    '#1234',
    '#11223380',
    'rgba(1, 2, 3, .5)',
    'transparent',
    'var(--fill)',
    'currentColor',
    '',
  ])
    expect(canvasMinimapPathGroups(rectangles, fill)).toBeNull()
  expect(canvasMinimapPathGroups(rectangles, 'rgb(1 2 3)')?.[0]?.count).toBe(3)
})

it('keeps official rendering for small, clickable, custom or stroked minimaps', () => {
  expect(canBatchCanvasMinimap(249, { nodeStrokeWidth: 0 })).toBe(false)
  expect(canBatchCanvasMinimap(250, { nodeStrokeWidth: 0 })).toBe(true)
  expect(canBatchCanvasMinimap(1000, {})).toBe(false)
  expect(canBatchCanvasMinimap(1000, { nodeStrokeWidth: 1 })).toBe(false)
  expect(canBatchCanvasMinimap(1000, { nodeStrokeWidth: 0, onNodeClick: () => undefined })).toBe(
    false,
  )
  expect(canBatchCanvasMinimap(1000, { nodeStrokeWidth: 0, nodeComponent: () => null })).toBe(false)
  expect(canBatchCanvasMinimap(1000, { nodeStrokeWidth: 0, nodeClassName: 'custom' })).toBe(false)
})
