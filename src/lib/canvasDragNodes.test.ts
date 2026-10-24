import { expect, it } from 'vitest'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { preserveMeasurement, synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import { canvasDragLayers } from '@renderer/lib/canvasDragLayers'

const topic = (x: number): CanvasFlowNode => ({
  id: 'topic',
  type: 'topic',
  position: { x, y: 0 },
  style: { width: 100, height: 40 },
  measured: { width: 100, height: 40 },
  data: {
    topic: { id: 'topic', title: 'Topic', children: [], collapsed: false, side: 'right' },
    root: false,
    branch: true,
    visualStyle: 'normal',
    fill: '#ffffff',
    color: '#000000',
    textColor: '#000000',
    fontFamily: 'sans-serif',
  },
  selected: true,
  draggable: true,
})
const selection = {
  dragging: undefined,
  topics: new Set(['topic']),
  drawings: new Set<string>(),
  playing: false,
}

it('keeps the released pointer position through selection notifications until geometry resolves', () => {
  const original = topic(0)
  const oldProjection = [original]
  const released = [{ ...original, position: { x: 180, y: 50 } }]
  const waiting = synchronizeCanvasNodes(released, oldProjection, {
    ...selection,
    geometryChanged: false,
  })
  expect(waiting).toBe(released)
  expect(waiting[0]?.position).toEqual({ x: 180, y: 50 })
  const deselected = synchronizeCanvasNodes(waiting, oldProjection, {
    ...selection,
    topics: new Set(),
    geometryChanged: false,
  })
  expect(deselected[0]?.selected).toBe(false)
  expect(deselected[0]?.position).toEqual({ x: 180, y: 50 })
  const finished = synchronizeCanvasNodes(deselected, [topic(180)], {
    ...selection,
    geometryChanged: true,
  })
  expect(finished[0]?.position).toEqual({ x: 180, y: 0 })
  expect(finished[0]?.measured).toBe(original.measured)
})

it('restores committed geometry on an explicit command failure while retaining selection', () => {
  const original = topic(0)
  const released = [{ ...original, position: { x: 180, y: 50 } }]
  const restored = synchronizeCanvasNodes(released, [original], {
    ...selection,
    geometryChanged: true,
  })
  expect(restored[0]?.position).toEqual(original.position)
  expect(restored[0]?.selected).toBe(true)
})

it('clears Resizer dimensions when undo restores an otherwise identical cached projection', () => {
  const original = topic(0)
  const resized = [
    { ...original, width: 220, measured: { width: 220, height: 40 }, resizing: false },
  ]
  const restored = synchronizeCanvasNodes(resized, [original], {
    ...selection,
    geometryChanged: true,
  })
  expect(restored[0]?.width).toBeUndefined()
  expect(restored[0]?.measured?.width).toBe(100)
  expect(restored[0]?.style?.width).toBe(100)
  expect(restored).not.toBe(resized)
})

it('retains an active resize preview across selection-only notifications', () => {
  const original = topic(0)
  const resizing = [
    { ...original, width: 220, measured: { width: 220, height: 40 }, resizing: true },
  ]
  const next = synchronizeCanvasNodes(resizing, [original], {
    ...selection,
    topics: new Set(),
    geometryChanged: false,
  })
  expect(next[0]?.selected).toBe(false)
  expect(next[0]?.width).toBe(220)
  expect(next[0]?.measured?.width).toBe(220)
  expect(next[0]?.resizing).toBe(true)
})

it('uses known projected bounds for the current frame instead of lagging behind the lens', () => {
  const original = topic(0)
  if (original.type === 'ink') throw new Error('Expected a topic')
  const previous = {
    ...original,
    data: { ...original.data, cameraScale: 1, worldWidth: 100, worldHeight: 40 },
  }
  const measured = { width: 120, height: 48 }
  const projected = {
    ...previous,
    measured,
    style: { width: 120, height: 48 },
    data: { ...previous.data, cameraScale: 1.2 },
  }
  expect(preserveMeasurement(projected, previous).measured).toBe(measured)
})

it('scopes composition layers to a gesture and preserves unrelated classes and node references', () => {
  const original = { ...topic(0), className: '[contain:layout_style] custom-topic' }
  const untouched = { ...topic(50), id: 'other' }
  const nodes = [original, untouched]
  const preview = canvasDragLayers(nodes, new Set(['topic']))
  expect(preview[0]?.className).toContain('will-change-transform')
  expect(preview[1]).toBe(untouched)
  expect(canvasDragLayers(preview, new Set(['topic']))).toBe(preview)
  const released = canvasDragLayers(preview)
  expect(released[0]?.className).toBe(original.className)
  expect(released[0]?.data).toBe(original.data)
  expect(released[0]?.position).toBe(original.position)
  expect(released[1]).toBe(untouched)
  expect(canvasDragLayers(released)).toBe(released)
})

it('keeps unaffected topic contents stable when only the selection changes', () => {
  const projected = [0, 1, 2].map((index) => ({
    ...topic(index * 100),
    id: `topic-${index}`,
    selected: index === 0,
  }))
  const next = synchronizeCanvasNodes(projected, projected, {
    ...selection,
    topics: new Set(['topic-1']),
    geometryChanged: false,
  })
  expect(next[0]?.selected).toBe(false)
  expect(next[1]?.selected).toBe(true)
  expect(next[2]).toBe(projected[2])
  expect(next[1]?.data).toBe(projected[1]?.data)
  expect(
    synchronizeCanvasNodes(next, projected, {
      ...selection,
      topics: new Set(['topic-1']),
      geometryChanged: false,
    }),
  ).toBe(next)
})

it('restores topic and ink dragging after playback without losing live pointer state', () => {
  const original = topic(0)
  const locked = { ...topic(200), id: 'locked', draggable: false, selected: false }
  const ink: CanvasFlowNode = {
    id: 'ink:stroke',
    type: 'ink',
    position: { x: 400, y: 20 },
    data: {
      stroke: {
        id: 'stroke',
        points: [
          { x: 0, y: 0, pressure: 0.5 },
          { x: 20, y: 20, pressure: 0.5 },
        ],
        color: '#000000',
        width: 4,
      },
    },
    draggable: true,
  }
  const projected = [original, locked, ink]
  const preview = [
    { ...original, position: { x: 90, y: 30 }, width: 180, resizing: true },
    locked,
    ink,
  ]
  const playing = synchronizeCanvasNodes(preview, projected, {
    ...selection,
    geometryChanged: false,
    drawings: new Set(['stroke']),
    playing: true,
  })
  expect(playing.map((node) => node.draggable)).toEqual([false, false, false])
  expect(playing[0]?.position).toBe(preview[0]?.position)
  expect(playing[0]?.width).toBe(180)
  expect(playing[0]?.resizing).toBe(true)
  expect(playing[2]?.selected).toBe(true)
  const resumed = synchronizeCanvasNodes(playing, projected, {
    ...selection,
    geometryChanged: false,
  })
  expect(resumed.map((node) => node.draggable)).toEqual([true, false, true])
  expect(resumed[0]?.position).toBe(preview[0]?.position)
  expect(resumed[2]?.selected).toBe(false)
})

it('uses canonical order when RF nodes no longer match an unchanged projection', () => {
  const first = topic(0)
  const second = { ...topic(200), id: 'second', selected: false }
  const next = synchronizeCanvasNodes([second, first], [first, second], {
    ...selection,
    geometryChanged: false,
  })
  expect(next).toEqual([first, second])
  expect(next[0]).toBe(first)
  expect(next[1]).toBe(second)
})
