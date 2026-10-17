import { afterEach, expect, it, vi } from 'vitest'
import { createRecoveryWriter } from '@renderer/lib/recoveryWriter'

afterEach(() => {
  vi.useRealTimers()
})

it('coalesces rapid typing and cancels pending recovery on leaving a document', async () => {
  vi.useFakeTimers()
  const write = vi.fn(() => Promise.resolve())
  const writer = createRecoveryWriter(write, vi.fn())
  writer.schedule()
  await vi.advanceTimersByTimeAsync(500)
  writer.schedule()
  await vi.advanceTimersByTimeAsync(699)
  expect(write).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(write).toHaveBeenCalledTimes(1)
  writer.schedule()
  writer.cancel()
  await vi.advanceTimersByTimeAsync(700)
  expect(write).toHaveBeenCalledTimes(1)
  writer.dispose()
})

it('serializes slow writes and keeps processing after a rejected recovery', async () => {
  vi.useFakeTimers()
  let finish: (() => void) | undefined
  const failure = new Error('disk unavailable')
  const failed = vi.fn()
  const write = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockRejectedValueOnce(failure)
    .mockResolvedValue(undefined)
  const writer = createRecoveryWriter(write, failed)
  writer.schedule()
  await vi.advanceTimersByTimeAsync(700)
  writer.schedule()
  await vi.advanceTimersByTimeAsync(700)
  expect(write).toHaveBeenCalledTimes(1)
  finish?.()
  await vi.advanceTimersByTimeAsync(0)
  expect(write).toHaveBeenCalledTimes(2)
  expect(failed).toHaveBeenCalledWith(failure)
  writer.schedule()
  await vi.advanceTimersByTimeAsync(700)
  expect(write).toHaveBeenCalledTimes(3)
  writer.dispose()
  writer.schedule()
  await vi.advanceTimersByTimeAsync(700)
  expect(write).toHaveBeenCalledTimes(3)
})
