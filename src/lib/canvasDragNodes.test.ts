import { expect, it } from 'vitest'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { preserveMeasurement, synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'

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
