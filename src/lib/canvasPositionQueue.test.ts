import { expect, it, vi } from 'vitest'
import { VirtualTimeScheduler } from 'rxjs'
import { createCanvasPositionQueue } from '@renderer/lib/canvasPositionQueue'

it('merges high-frequency positions by ID and publishes one complete frame', () => {
  const scheduler = new VirtualTimeScheduler()
  const commit = vi.fn()
  const queue = createCanvasPositionQueue(commit, scheduler)
  queue.request([{ id: 'first', type: 'position', position: { x: 10, y: 20 }, dragging: true }])
  queue.request([{ id: 'second', type: 'position', position: { x: 30, y: 40 }, dragging: true }])
  queue.request([{ id: 'first', type: 'position', position: { x: 50, y: 60 }, dragging: true }])
  queue.request([{ id: 'second', type: 'position', dragging: true }])
  expect(commit).not.toHaveBeenCalled()
  scheduler.flush()
  expect(commit).toHaveBeenCalledTimes(1)
  expect(commit).toHaveBeenLastCalledWith([
    { id: 'first', type: 'position', position: { x: 50, y: 60 }, dragging: true },
    { id: 'second', type: 'position', position: { x: 30, y: 40 }, dragging: true },
  ])
  queue.dispose()
})

it('drains the final pointer position synchronously without replaying it on the next frame', () => {
  const scheduler = new VirtualTimeScheduler()
  const commit = vi.fn()
  const queue = createCanvasPositionQueue(commit, scheduler)
  const final = {
    id: 'first',
    type: 'position' as const,
    position: { x: 21, y: 34 },
    dragging: true,
  }
  queue.request([final])
  queue.flush()
  expect(commit).toHaveBeenCalledExactlyOnceWith([final])
  scheduler.flush()
  expect(commit).toHaveBeenCalledTimes(1)
  queue.dispose()
})

it('discards canceled work and accepts the next gesture while disposal cancels all frames', () => {
  const scheduler = new VirtualTimeScheduler()
  const commit = vi.fn()
  const queue = createCanvasPositionQueue(commit, scheduler)
  queue.request([{ id: 'canceled', type: 'position', position: { x: 80, y: 90 }, dragging: true }])
  queue.clear()
  scheduler.flush()
  expect(commit).not.toHaveBeenCalled()
  queue.request([{ id: 'next', type: 'position', position: { x: 1, y: 2 }, dragging: true }])
  scheduler.flush()
  expect(commit).toHaveBeenCalledTimes(1)
  queue.request([{ id: 'disposed', type: 'position', position: { x: 3, y: 4 }, dragging: true }])
  queue.dispose()
  queue.flush()
  queue.request([{ id: 'late', type: 'position', dragging: true }])
  scheduler.flush()
  expect(commit).toHaveBeenCalledTimes(1)
})
