import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createThreeTopicQualityQueue,
  TOPIC_QUALITY_QUIET_MS,
} from '@renderer/lib/threeTopicQualityQueue'

afterEach(() => {
  vi.useRealTimers()
})

describe('idle topic quality queue', () => {
  it('does no projection work during continuous camera frames and cancels stale preparation', async () => {
    vi.useFakeTimers()
    const run = vi.fn<(signal: AbortSignal) => Promise<void>>(() => Promise.resolve())
    const queue = createThreeTopicQualityQueue(run)
    for (let index = 0; index < 120; index++) {
      queue.request()
      await vi.advanceTimersByTimeAsync(16)
    }
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(TOPIC_QUALITY_QUIET_MS)
    expect(run).toHaveBeenCalledTimes(1)
    const signal = run.mock.calls[0]?.[0]
    queue.request()
    expect(signal?.aborted).toBe(true)
    queue.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('bounds scan frequency through slow continuous zoom notifications', async () => {
    vi.useFakeTimers()
    const run = vi.fn<(signal: AbortSignal) => Promise<void>>(() => Promise.resolve())
    const queue = createThreeTopicQualityQueue(run)
    for (let index = 0; index < 8; index++) {
      queue.request()
      await vi.advanceTimersByTimeAsync(250)
    }
    expect(run.mock.calls.length).toBeLessThanOrEqual(4)
    queue.dispose()
  })
})
