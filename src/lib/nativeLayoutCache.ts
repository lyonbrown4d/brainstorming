import { LRUCache } from 'lru-cache'
import type { Query, QueryClient, QueryKey } from '@tanstack/react-query'
import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import type { NativeSpatialLayout } from '@shared/compute'

const sourceSizes = new WeakMap<MindMapDocument, number>()
/** Estimate retained source objects without serializing notes or media into another copy. */
export const estimateLayoutSource = (document: MindMapDocument): number => {
  const existing = sourceSizes.get(document)
  if (existing !== undefined) return existing
  let bytes = 512
  for (const topic of Object.values(document.topics))
    bytes +=
      384 +
      2 * (topic.id.length + topic.title.length + (topic.notes?.length ?? 0)) +
      topic.children.length * 32
  for (const asset of Object.values(document.assets ?? {}))
    bytes += 256 + 2 * (asset.id.length + asset.name.length + (asset.data?.length ?? 0))
  for (const stroke of document.drawings ?? []) bytes += 192 + stroke.points.length * 32
  bytes += (document.groups?.length ?? 0) * 192 + (document.relations?.length ?? 0) * 256
  sourceSizes.set(document, bytes)
  return bytes
}
const retainedSize = (query: Query): number => {
  // TanStack retains both the structured key and its serialized hash.
  let bytes = 512 + query.queryHash.length * 2
  for (const part of query.queryKey) if (typeof part === 'string') bytes += part.length * 2
  const source = query.meta?.layoutSourceBytes
  if (typeof source === 'number' && Number.isFinite(source)) bytes += source
  const data = query.state.data as MindMapLayout | NativeSpatialLayout | undefined
  const layout = data && 'layout' in data ? data.layout : data
  if (layout) {
    for (const node of layout.nodes) bytes += 224 + node.id.length * 2
    for (const edge of layout.edges)
      bytes +=
        224 +
        (edge.id.length + edge.source.length + edge.target.length) * 2 +
        (edge.waypoints?.length ?? 0) * 32
    for (const decoration of layout.decorations ?? []) bytes += 192 + decoration.id.length * 2
    if (data && 'depths' in data) bytes += Object.keys(data.depths).length * 64
  }
  return Math.max(1, Math.ceil(bytes))
}

/** Only inactive, settled layouts consume the bounded LRU; mounted canvases stay available. */
export const boundNativeLayoutCache = (
  client: QueryClient,
  { maxEntries = 12, maxBytes = 24 * 1024 * 1024 }: { maxEntries?: number; maxBytes?: number } = {},
): { readonly touch: (key: QueryKey) => void; readonly dispose: () => void } => {
  const cache = client.getQueryCache()
  const inactive = new LRUCache<string, Query>({
    max: maxEntries,
    maxSize: maxBytes,
    sizeCalculation: retainedSize,
    disposeAfter: (query, _key, reason) => {
      if (
        reason === 'evict' &&
        query.getObserversCount() === 0 &&
        query.state.fetchStatus === 'idle'
      )
        cache.remove(query)
    },
  })
  const track = (query: Query): void => {
    if (query.queryKey[0] !== 'canvas-layout' && query.queryKey[0] !== 'canvas-spatial-layout')
      return
    if (query.getObserversCount() > 0 || query.state.fetchStatus !== 'idle') {
      inactive.delete(query.queryHash)
      return
    }
    const bytes = retainedSize(query)
    if (bytes > maxBytes) {
      inactive.delete(query.queryHash)
      cache.remove(query)
    } else inactive.set(query.queryHash, query, { size: bytes })
  }
  for (const query of cache.getAll()) track(query)
  const unsubscribe = cache.subscribe((event) => {
    const hash = event.query.queryHash
    if (event.type === 'removed') inactive.delete(hash)
    // Observer result/options events also fire before the first subscription.
    // Track actual mounts, unmounts and fetch/data changes, rather than evicting
    // a query while React is still constructing its observer.
    else if (
      event.type === 'updated' ||
      event.type === 'observerAdded' ||
      event.type === 'observerRemoved'
    ) {
      // The library event uses Query<any>; retrieving by hash restores unknown
      // data/key types at this boundary without weakening lint checks.
      const query = cache.get(hash)
      if (query) track(query)
    }
  })
  return {
    touch: (key) => {
      const query = cache.find({ queryKey: key, exact: true })
      if (query) track(query)
    },
    dispose: () => {
      unsubscribe()
      inactive.clear()
    },
  }
}
