import { expect, it, vi } from 'vitest'
import { VirtualTimeScheduler } from 'rxjs'
import { bindIndependentSpatialMinimapQueue } from '@renderer/lib/independentSpatialMinimapQueue'
import {
  independentSpatialMinimapGeometry,
  independentSpatialMinimapTopic,
  type IndependentMinimapSnapshot,
} from '@renderer/lib/independentSpatialMinimapGeometry'

const setup = () => {
  const quiet = new VirtualTimeScheduler(),
    frame = new VirtualTimeScheduler(),
    task = new VirtualTimeScheduler()
  let value = 0,
    dragging = false
  const sourceListeners = new Set<() => void>(),
    interactionListeners = new Set<() => void>()
  const read = vi.fn(() => value)
  const snapshots: number[] = []
  const queue = bindIndependentSpatialMinimapQueue(
    {
      read,
      interacting: () => dragging,
      subscribe: (callback) => {
        sourceListeners.add(callback)
        return () => {
          sourceListeners.delete(callback)
        }
      },
      subscribeInteraction: (callback) => {
        interactionListeners.add(callback)
        return () => {
          interactionListeners.delete(callback)
        }
      },
    },
    (snapshot) => snapshots.push(snapshot),
    { quiet, frame, task },
  )
  const flush = () => {
    quiet.flush()
    frame.flush()
    task.flush()
  }
  return {
    quiet,
    frame,
    task,
    read,
    snapshots,
    queue,
    flush,
    sourceListeners,
    interactionListeners,
    change: (next: number) => {
      value = next
      for (const callback of sourceListeners) callback()
    },
    interact: (next: boolean) => {
      dragging = next
      for (const callback of interactionListeners) callback()
    },
  }
}

it('reads projected geometry only after quiet, the main frame and the later task; newer work cancels stale tasks', () => {
  const state = setup()
  for (let index = 1; index <= 100; index++) state.change(index)
  expect(state.read).not.toHaveBeenCalled()
  state.quiet.flush()
  state.frame.flush()
  expect(state.read).not.toHaveBeenCalled()
  state.change(101)
  state.task.flush()
  expect(state.snapshots).toEqual([])
  state.flush()
  expect(state.snapshots).toEqual([101])
  state.queue.unsubscribe()
})

it('freezes projection during dragging and refreshes the final or cancelled geometry after quiet', () => {
  const state = setup()
  state.interact(true)
  state.change(5)
  state.flush()
  expect(state.read).not.toHaveBeenCalled()
  state.interact(false)
  expect(state.read).not.toHaveBeenCalled()
  state.flush()
  expect(state.snapshots).toEqual([5])
  state.interact(true)
  state.change(20)
  state.flush()
  state.change(0)
  state.interact(false)
  state.flush()
  expect(state.snapshots).toEqual([5, 0])
  state.queue.unsubscribe()
})

it('closing or unmounting cancels a pending bitmap and removes source/interaction subscriptions', () => {
  for (const stage of ['quiet', 'frame', 'task']) {
    const state = setup()
    state.change(10)
    if (stage !== 'quiet') state.quiet.flush()
    if (stage === 'task') state.frame.flush()
    state.queue.unsubscribe()
    state.flush()
    state.change(30)
    state.interact(false)
    state.queue.request()
    state.flush()
    expect(state.read).not.toHaveBeenCalled()
    expect(state.sourceListeners.size).toBe(0)
    expect(state.interactionListeners.size).toBe(0)
  }
})

const snapshot: IndependentMinimapSnapshot = {
  viewport: { x: 100, y: 50, width: 1000, height: 600 },
  rectangles: [
    { id: 'near', kind: 'topic', x: 200, y: 100, width: 100, height: 50, depth: 400 },
    { id: 'far', kind: 'topic', x: 200, y: 100, width: 100, height: 50, depth: 800 },
    { id: 'outside', kind: 'topic', x: 1600, y: 300, width: 100, height: 100, depth: 600 },
    {
      id: 'ink-stroke',
      kind: 'ink',
      drawingId: 'stroke',
      x: -200,
      y: -100,
      width: 50,
      height: 50,
      depth: 300,
    },
  ],
  colors: new Map(),
  background: '#ffffff',
  foreground: '#222222',
}

it('fits projected topics, ink and the actual viewport while mapping overview clicks to canonical topics', () => {
  const geometry = independentSpatialMinimapGeometry(snapshot, 176, 112)
  if (!geometry) throw new Error('Missing minimap geometry')
  const point = (x: number, y: number) => ({
    x: geometry.x + x * geometry.scale,
    y: geometry.y + y * geometry.scale,
  })
  expect(point(-200, -100).x).toBeCloseTo(8)
  expect(point(1700, 650).x).toBeCloseTo(168)
  expect(geometry.scale).toBeGreaterThan(0)
  expect(independentSpatialMinimapTopic(geometry, point(250, 125))).toBe('near')
  expect(independentSpatialMinimapTopic(geometry, point(1650, 350))).toBe('outside')
  expect(independentSpatialMinimapTopic(geometry, point(-175, -75))).toBe('near')
  expect(independentSpatialMinimapTopic(geometry, { x: Infinity, y: 0 })).toBeNull()
  expect(independentSpatialMinimapGeometry(snapshot, 0, 112)).toBeNull()
  const empty = independentSpatialMinimapGeometry({ ...snapshot, rectangles: [] }, 176, 112)
  if (!empty) throw new Error('Missing empty viewport geometry')
  expect(independentSpatialMinimapTopic(empty, { x: 80, y: 40 })).toBeNull()
})
