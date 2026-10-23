import { createCanvasMinimapQueue } from '@renderer/lib/canvasMinimapQueue'

export interface IndependentMinimapSource<T> {
  readonly read: () => T | null
  readonly interacting: () => boolean
  readonly subscribe: (changed: () => void) => () => void
  readonly subscribeInteraction: (changed: () => void) => () => void
}

/** Camera notices only invalidate pending work; projection waits behind a quiet main-canvas frame. */
export const bindIndependentSpatialMinimapQueue = <T>(
  source: IndependentMinimapSource<T>,
  publish: (snapshot: T) => void,
  schedulers?: Parameters<typeof createCanvasMinimapQueue>[1],
) => {
  const queue = createCanvasMinimapQueue(() => {
    if (source.interacting()) return
    const snapshot = source.read()
    if (snapshot !== null) publish(snapshot)
  }, schedulers)
  const stopSource = source.subscribe(queue.request)
  const stopInteraction = source.subscribeInteraction(queue.request)
  queue.request()
  return {
    request: queue.request,
    unsubscribe: () => {
      stopSource()
      stopInteraction()
      queue.unsubscribe()
    },
  }
}
