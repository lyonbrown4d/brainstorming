import { Subject, asyncScheduler, debounceTime, throttleTime } from 'rxjs'

export const TOPIC_QUALITY_QUIET_MS = 180
export const TOPIC_QUALITY_INTERVAL_MS = 600

/** Camera notifications only cancel a pending task and enqueue one quiet-period request. */
export const createThreeTopicQualityQueue = (run: (signal: AbortSignal) => Promise<void>) => {
  const requests = new Subject<void>()
  let controller = new AbortController()
  let requestedAt = 0
  let disposed = false
  const subscription = requests
    .pipe(
      debounceTime(TOPIC_QUALITY_QUIET_MS),
      throttleTime(TOPIC_QUALITY_INTERVAL_MS, asyncScheduler, { leading: true, trailing: true }),
    )
    .subscribe(() => {
      if (disposed || asyncScheduler.now() - requestedAt < TOPIC_QUALITY_QUIET_MS) return
      controller = new AbortController()
      void run(controller.signal).catch(() => undefined)
    })
  return {
    request: () => {
      if (disposed) return
      controller.abort()
      requestedAt = asyncScheduler.now()
      requests.next()
    },
    dispose: () => {
      disposed = true
      controller.abort()
      subscription.unsubscribe()
      requests.complete()
    },
  }
}
