import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MindMapWorkbook } from '@core'
import type { ComputeAPI, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({ compute: null as ComputeAPI | null }))
vi.mock('@renderer/lib/desktop', () => ({ getPlatformAPI: () => ({ compute: platform.compute }) }))

import {
  flushNativeEditor,
  forgetNativeEditor,
  queueNativeEditor,
  releaseNativeEditor,
} from '@renderer/state/nativeEditorQueue'

const workbook = (id: string): MindMapWorkbook => ({
  format: 'brainstorming',
  version: 2,
  id,
  title: id,
  sheets: [
    {
      id: 'sheet',
      name: 'Sheet',
      document: {
        format: 'brainstorming',
        version: 1,
        id: 'document',
        title: 'Root',
        rootId: 'root',
        topics: {
          root: { id: 'root', title: 'Root', children: [], collapsed: false, side: 'right' },
        },
      },
    },
  ],
})

const snapshot = (book: MindMapWorkbook, revision: string): NativeEditorSnapshot => ({
  sessionId: book.id,
  revision,
  workbook: book,
  canUndo: revision !== '0',
  canRedo: false,
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  platform.compute = null
})

describe('native editor queue', () => {
  it('serializes dependent edits with the acknowledged revision', async () => {
    const book = workbook('serial')
    const first = deferred<NativeEditorSnapshot>()
    const started = deferred<undefined>()
    const revisions: string[] = []
    platform.compute = {
      openSession: () => Promise.resolve(snapshot(book, '0')),
      executeSession: async (_id: string, revision: string) => {
        revisions.push(revision)
        started.resolve(undefined)
        return revisions.length === 1 ? first.promise : snapshot(book, '2')
      },
    } as unknown as ComputeAPI
    const received: string[] = []
    const errors: Error[] = []
    const callback = (value: NativeEditorSnapshot) => received.push(value.revision)
    const report = (error: Error) => errors.push(error)
    expect(queueNativeEditor(book, { kind: 'undo' }, callback, report)).toBe(true)
    expect(queueNativeEditor(book, { kind: 'redo' }, callback, report)).toBe(true)
    await started.promise
    expect(revisions).toEqual(['0'])
    first.resolve(snapshot(book, '1'))
    await flushNativeEditor(book.id)
    expect(revisions).toEqual(['0', '1'])
    expect(received).toEqual(['1', '2'])
    expect(errors).toEqual([])
    forgetNativeEditor(book.id)
  })

  it('stops later dependent operations after a rejected revision', async () => {
    const book = workbook('failed')
    const execute = vi.fn(() => Promise.reject(new Error('编辑版本已过期')))
    platform.compute = {
      openSession: () => Promise.resolve(snapshot(book, '5')),
      executeSession: execute,
    } as unknown as ComputeAPI
    const errors: Error[] = []
    const ignored = vi.fn()
    queueNativeEditor(book, { kind: 'undo' }, ignored, (error) => errors.push(error))
    queueNativeEditor(book, { kind: 'redo' }, ignored, (error) => errors.push(error))
    await expect(flushNativeEditor(book.id)).rejects.toThrow('编辑版本已过期')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(errors).toHaveLength(1)
    forgetNativeEditor(book.id)
  })

  it('waits for a closing session before reopening the same workbook', async () => {
    const book = workbook('released')
    const close = deferred<undefined>()
    const closeStarted = deferred<undefined>()
    const opened: string[] = []
    platform.compute = {
      openSession: () => {
        opened.push(book.id)
        return Promise.resolve(snapshot(book, '0'))
      },
      executeSession: () => Promise.resolve(snapshot(book, '1')),
      closeSession: () => {
        closeStarted.resolve(undefined)
        return close.promise
      },
    } as unknown as ComputeAPI
    const ignored = vi.fn()
    queueNativeEditor(book, { kind: 'undo' }, ignored, ignored)
    await flushNativeEditor(book.id)
    const releasing = releaseNativeEditor(book.id)
    await closeStarted.promise
    queueNativeEditor(book, { kind: 'undo' }, ignored, ignored)
    await Promise.resolve()
    expect(opened).toHaveLength(1)
    close.resolve(undefined)
    await releasing
    await flushNativeEditor(book.id)
    expect(opened).toHaveLength(2)
    forgetNativeEditor(book.id)
  })
})

it('reopens the existing authoritative session after an explicit retry', async () => {
  const book = workbook('retry')
  const open = vi
    .fn()
    .mockResolvedValueOnce(snapshot(book, '0'))
    .mockResolvedValueOnce(snapshot(book, '4'))
  const execute = vi
    .fn<ComputeAPI['executeSession']>()
    .mockRejectedValueOnce(new Error('temporary transport failure'))
    .mockResolvedValueOnce(snapshot(book, '5'))
  platform.compute = { openSession: open, executeSession: execute } as unknown as ComputeAPI
  const receive = vi.fn()
  const report = vi.fn()
  queueNativeEditor(book, { kind: 'undo' }, receive, report)
  await expect(flushNativeEditor(book.id)).rejects.toThrow('temporary transport failure')
  expect(queueNativeEditor(book, { kind: 'redo' }, receive, report)).toBe(true)
  await flushNativeEditor(book.id)
  expect(execute.mock.calls.map((call) => call[1])).toEqual(['0', '4'])
  expect(receive).toHaveBeenCalledWith(snapshot(book, '5'), '4')
  expect(report).toHaveBeenCalledTimes(1)
  forgetNativeEditor(book.id)
})

it('waits for dependent edits appended while an earlier flush is pending', async () => {
  const book = workbook('appended')
  const first = deferred<NativeEditorSnapshot>()
  const second = deferred<NativeEditorSnapshot>()
  const execute = vi
    .fn<ComputeAPI['executeSession']>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(book, '0')),
    executeSession: execute,
  } as unknown as ComputeAPI
  const ignored = vi.fn()
  queueNativeEditor(book, { kind: 'undo' }, ignored, ignored)
  let flushed = false
  const flushing = flushNativeEditor(book.id).then(() => {
    flushed = true
  })
  queueNativeEditor(book, { kind: 'redo' }, ignored, ignored)
  first.resolve(snapshot(book, '1'))
  await vi.waitFor(() => {
    expect(execute).toHaveBeenCalledTimes(2)
  })
  expect(flushed).toBe(false)
  second.resolve(snapshot(book, '2'))
  await flushing
  expect(flushed).toBe(true)
  forgetNativeEditor(book.id)
})
