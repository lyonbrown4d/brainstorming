import { concatMap, defer, Subject } from 'rxjs'

interface WriteQueue {
  readonly requests: Subject<() => Promise<void>>
  pending: number
}
const queues = new Map<string, WriteQueue>()

/** Native writes and release share a path queue, including a Save As from that path. */
export const queueDocumentWrite = <T>(path: string | null, write: () => Promise<T>): Promise<T> => {
  if (path === null) return write()
  let queue = queues.get(path)
  if (!queue) {
    queue = { requests: new Subject(), pending: 0 }
    queue.requests.pipe(concatMap((run) => defer(run))).subscribe()
    queues.set(path, queue)
  }
  const current = queue
  current.pending += 1
  return new Promise<T>((resolve, reject) => {
    current.requests.next(async () => {
      try {
        resolve(await write())
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      } finally {
        current.pending -= 1
        if (current.pending === 0) {
          queues.delete(path)
          current.requests.complete()
        }
      }
    })
  })
}
