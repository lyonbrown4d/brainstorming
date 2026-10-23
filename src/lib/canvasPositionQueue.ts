import { animationFrameScheduler, auditTime, Subject, type SchedulerLike } from 'rxjs'
import type { NodePositionChange } from '@xyflow/react'

/** Keep every moved ID, while publishing only its newest pointer position each display frame. */
export const createCanvasPositionQueue = (
  commit: (changes: NodePositionChange[]) => void,
  scheduler: SchedulerLike = animationFrameScheduler,
) => {
  const requests = new Subject<void>()
  const pending = new Map<string, NodePositionChange>()
  let disposed = false
  const flush = () => {
    if (disposed || !pending.size) return
    const changes = [...pending.values()]
    pending.clear()
    commit(changes)
  }
  const subscription = requests.pipe(auditTime(0, scheduler)).subscribe(flush)
  return {
    request: (changes: readonly NodePositionChange[]) => {
      if (disposed) return
      for (const change of changes) pending.set(change.id, { ...pending.get(change.id), ...change })
      requests.next()
    },
    flush,
    clear: () => {
      pending.clear()
    },
    dispose: () => {
      disposed = true
      pending.clear()
      subscription.unsubscribe()
      requests.complete()
    },
  }
}
