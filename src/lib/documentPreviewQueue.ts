interface PendingJob<T> {
  readonly id: string
  readonly value: T
  cancelled: boolean
  readonly controller: AbortController
}
/** One renderer allocation at a time; each document retains only its newest save. */
export const createDocumentPreviewQueue = <T>(
  run: (value: T, current: () => boolean, signal: AbortSignal) => Promise<void>,
  onFailure: () => void,
): {
  enqueue: (id: string, value: T) => void
  cancel: (id: string) => void
  dispose: () => void
} => {
  const pending = new Map<string, PendingJob<T>>()
  let active: PendingJob<T> | undefined
  let scheduled: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const drain = async (): Promise<void> => {
    scheduled = undefined
    while (!disposed && pending.size > 0) {
      const next = pending.values().next().value
      if (!next) break
      pending.delete(next.id)
      active = next
      const current = (): boolean => !disposed && !next.cancelled
      try {
        await run(next.value, current, next.controller.signal)
      } catch {
        if (current()) onFailure()
      }
      active = undefined
    }
  }
  return {
    enqueue: (id, value) => {
      if (disposed) return
      if (active?.id === id) {
        active.cancelled = true
        active.controller.abort()
      }
      if (!pending.has(id) && pending.size >= 32) return
      pending.set(id, { id, value, cancelled: false, controller: new AbortController() })
      if (!active && scheduled === undefined) scheduled = setTimeout(() => void drain(), 250)
    },
    cancel: (id) => {
      pending.delete(id)
      if (pending.size === 0 && !active) {
        clearTimeout(scheduled)
        scheduled = undefined
      }
      if (active?.id === id) {
        active.cancelled = true
        active.controller.abort()
      }
    },
    dispose: () => {
      disposed = true
      pending.clear()
      if (active) {
        active.cancelled = true
        active.controller.abort()
      }
      clearTimeout(scheduled)
    },
  }
}
