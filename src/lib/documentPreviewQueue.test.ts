import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocumentPreviewQueue } from '@renderer/lib/documentPreviewQueue'

afterEach(() => vi.useRealTimers())
describe('background document preview scheduling', () => {
  it('coalesces saves, cancels obsolete renders, and runs documents serially', async () => {
    vi.useFakeTimers()
    const starts: string[] = []
    const writes: string[] = []
    let finish: (() => void) | undefined
    const queue = createDocumentPreviewQueue<string>(async (value, current) => {
      starts.push(value)
      if (value === 'first')
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      if (current()) writes.push(value)
    }, vi.fn())
    queue.enqueue('a', 'first')
    await vi.advanceTimersByTimeAsync(250)
    queue.enqueue('a', 'superseded')
    queue.enqueue('a', 'latest')
    queue.enqueue('b', 'other')
    expect(starts).toEqual(['first'])
    finish?.()
    await vi.runAllTimersAsync()
    expect(starts).toEqual(['first', 'latest', 'other'])
    expect(writes).toEqual(['latest', 'other'])
    queue.dispose()
  })
  it('drops closed documents and isolates rendering failures from later saves', async () => {
    vi.useFakeTimers()
    const completed: string[] = []
    const failure = vi.fn()
    const queue = createDocumentPreviewQueue<string>((value) => {
      if (value === 'broken') return Promise.reject(new Error('decode failed'))
      completed.push(value)
      return Promise.resolve()
    }, failure)
    queue.enqueue('closed', 'closed')
    queue.cancel('closed')
    queue.enqueue('bad', 'broken')
    queue.enqueue('good', 'saved')
    await vi.runAllTimersAsync()
    expect(completed).toEqual(['saved'])
    expect(failure).toHaveBeenCalledOnce()
    queue.dispose()
    queue.enqueue('after-dispose', 'ignored')
    await vi.runAllTimersAsync()
    expect(completed).toEqual(['saved'])
  })
})
