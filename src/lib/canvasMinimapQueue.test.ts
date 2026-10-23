import { expect, it } from 'vitest'
import { VirtualTimeScheduler } from 'rxjs'
import { createCanvasMinimapQueue } from '@renderer/lib/canvasMinimapQueue'

const setup = () => {
  const quiet = new VirtualTimeScheduler()
  const frame = new VirtualTimeScheduler()
  const task = new VirtualTimeScheduler()
  let source = 0
  const snapshots: number[] = []
  const queue = createCanvasMinimapQueue(() => snapshots.push(source), {
    quiet,
    frame,
    task,
  })
  return {
    quiet,
    frame,
    task,
    snapshots,
    queue,
    change: (value: number) => {
      source = value
      queue.request()
    },
  }
}

it('keeps the main source immediate, coalesces bursts, and reads only after the frame and task', () => {
  const state = setup()
  for (let index = 1; index <= 100; index++) state.change(index)
  expect(state.snapshots).toEqual([])
  state.quiet.flush()
  expect(state.snapshots).toEqual([])
  state.frame.flush()
  expect(state.snapshots).toEqual([])
  state.change(101)
  state.task.flush()
  expect(state.snapshots).toEqual([])
  state.quiet.flush()
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([101])
  state.queue.unsubscribe()
})

it('flushes final or cancelled gestures without the quiet delay and cannot rewind later updates', () => {
  const state = setup()
  state.change(1)
  state.queue.finish()
  state.queue.finish()
  state.frame.flush()
  state.change(2)
  state.queue.finish()
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([2])
  // The quiet notice still reads current source rather than retaining the old gesture snapshot.
  state.change(3)
  state.quiet.flush()
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([2, 3])
  state.change(0)
  state.queue.finish()
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([2, 3, 0])
  state.queue.unsubscribe()
})

it('cancels queued quiet, frame and task writes when the overview closes or unmounts', () => {
  for (const stage of ['quiet', 'frame', 'task']) {
    const state = setup()
    state.change(1)
    if (stage !== 'quiet') state.quiet.flush()
    if (stage === 'task') state.frame.flush()
    state.queue.unsubscribe()
    state.quiet.flush()
    state.frame.flush()
    state.task.flush()
    state.change(2)
    state.queue.finish()
    expect(state.snapshots).toEqual([])
  }
})

it('waits for continuous navigation to become quiet instead of repainting between frames', () => {
  const state = setup()
  for (const at of [0, 40, 80, 120])
    state.quiet.schedule(() => {
      state.change(at)
    }, at)
  state.quiet.maxFrames = 180
  state.quiet.flush()
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([])
  state.quiet.maxFrames = 200
  state.quiet.flush()
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([120])
  state.queue.unsubscribe()
})

it('cancels a queued overview frame when a slow main frame resumes after the quiet timer', () => {
  const state = setup()
  state.change(1)
  state.quiet.flush()
  state.change(2)
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([])
  state.quiet.flush()
  state.frame.flush()
  state.task.flush()
  expect(state.snapshots).toEqual([2])
  state.queue.unsubscribe()
})
