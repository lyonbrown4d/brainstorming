import { afterEach, expect, it } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { boundNativeLayoutCache } from '@renderer/lib/nativeLayoutCache'
import type { MindMapLayout } from '@layout'

const layout: MindMapLayout = { nodes: [], edges: [] }
const key = (id: string) => ['canvas-layout', 'sheet', id, 'geometry'] as const
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose()
})
const bounded = (maxEntries: number, maxBytes = 10_000) => {
  const client = new QueryClient()
  const cache = boundNativeLayoutCache(client, { maxEntries, maxBytes })
  cleanups.push(() => {
    cache.dispose()
    client.clear()
  })
  return { client, ...cache }
}

it('bounds inactive revisions by count and retains recently reused export geometry', () => {
  const { client, touch } = bounded(2)
  client.setQueryData(key('a'), layout)
  client.setQueryData(key('b'), layout)
  touch(key('a'))
  client.setQueryData(key('c'), layout)
  expect(client.getQueryData(key('a'))).toBe(layout)
  expect(client.getQueryData(key('b'))).toBeUndefined()
  expect(client.getQueryData(key('c'))).toBe(layout)
  expect(client.getQueryCache().getAll()).toHaveLength(2)
})

it('keeps observed canvas geometry and applies the LRU when its observer detaches', () => {
  const { client } = bounded(1)
  client.setQueryData(key('canvas'), layout)
  const observer = new QueryObserver(client, { queryKey: key('canvas'), enabled: false })
  const unsubscribe = observer.subscribe(() => undefined)
  client.setQueryData(key('old'), layout)
  client.setQueryData(key('recent'), layout)
  expect(client.getQueryData(key('canvas'))).toBe(layout)
  expect(client.getQueryData(key('old'))).toBeUndefined()
  unsubscribe()
  expect(client.getQueryData(key('recent'))).toBeUndefined()
  expect(client.getQueryData(key('canvas'))).toBe(layout)
  expect(client.getQueryCache().getAll()).toHaveLength(1)
})

it('bounds retained bytes, including large keys, and leaves other query domains alone', async () => {
  const { client, touch } = bounded(10, 2_000)
  client.setQueryData(['other-feature', 'unchanged'], { important: true })
  client.setQueryData(key('small'), layout)
  client.setQueryData(key('huge'.repeat(1000)), layout)
  expect(client.getQueryData(key('huge'.repeat(1000)))).toBeUndefined()
  expect(client.getQueryData(['other-feature', 'unchanged'])).toEqual({ important: true })
  const bigGeometry: MindMapLayout = {
    nodes: Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      side: 'right',
    })),
    edges: [],
  }
  client.setQueryData(key('big-data'), bigGeometry)
  expect(client.getQueryData(key('big-data'))).toBeUndefined()
  expect(client.getQueryData(key('small'))).toBe(layout)
  // An imperative fresh hit keeps the old queryFn/source; unused new options
  // do not count as retained memory.
  await client.query({
    queryKey: key('small'),
    queryFn: () => Promise.resolve(layout),
    staleTime: Infinity,
    meta: { layoutSourceBytes: 5_000 },
  })
  touch(key('small'))
  expect(client.getQueryData(key('small'))).toBe(layout)
  const observer = new QueryObserver(client, { queryKey: key('small'), enabled: false })
  const unsubscribe = observer.subscribe(() => undefined)
  // Canvas observers replace their queryFn/source even when geometry is unchanged.
  observer.setOptions({
    queryKey: key('small'),
    enabled: false,
    meta: { layoutSourceBytes: 5_000 },
  })
  touch(key('small'))
  expect(client.getQueryData(key('small'))).toBe(layout)
  unsubscribe()
  expect(client.getQueryData(key('small'))).toBeUndefined()
})
