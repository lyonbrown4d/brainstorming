import { afterEach, expect, it, vi } from 'vitest'
import { hashKey, QueryClient, QueryObserver } from '@tanstack/react-query'
import { createFixtureDocument } from '@core'
import { nativeLayoutQuery } from '@renderer/lib/nativeLayout'
import { nativeSpatialLayoutQuery } from '@renderer/lib/nativeSpatialLayout'
import { hashNativeLayoutKey } from '@renderer/lib/nativeLayoutQueryKey'

const clients: QueryClient[] = []
afterEach(() => {
  vi.restoreAllMocks()
  clients.splice(0).forEach((client) => {
    client.clear()
  })
})
const key = (sheet = 'sheet', geometry = 'large geometry', depth?: string) =>
  Object.freeze(['canvas-layout', sheet, 'document', geometry, ...(depth ? [depth] : [])])

it('serializes each retained 2D and 3D geometry key once across repeated lookups', () => {
  const document = createFixtureDocument(1000)
  const queries = [
    nativeLayoutQuery(document, 'large', []),
    nativeSpatialLayoutQuery(document, 'large', { mode: '3d', yaw: 0, pitch: 0, spacing: 100 }, []),
  ]
  for (const options of queries) {
    const expected = hashKey(options.queryKey)
    const serialize = vi.spyOn(JSON, 'stringify')
    for (let i = 0; i < 40; i++) expect(options.queryKeyHashFn(options.queryKey)).toBe(expected)
    expect(serialize).toHaveBeenCalledTimes(1)
    serialize.mockRestore()
  }
})

it('preserves structural cache identity, exact filters and default QueryClient reads', async () => {
  const client = new QueryClient()
  clients.push(client)
  const queryKey = key()
  const queryFn = vi.fn(() => Promise.resolve({ nodes: ['root'] }))
  const options = { queryKey, queryFn, queryKeyHashFn: hashNativeLayoutKey, staleTime: Infinity }
  await client.query(options)
  await client.query({ ...options, queryKey: key() })
  expect(queryFn).toHaveBeenCalledTimes(1)
  expect(client.getQueryData(key())).toEqual({ nodes: ['root'] })
  expect(client.getQueryCache().find({ queryKey: key(), exact: true })?.queryHash).toBe(
    hashKey(queryKey),
  )
  const observer = new QueryObserver(client, { ...options, enabled: false })
  const unsubscribe = observer.subscribe(() => undefined)
  for (let i = 0; i < 20; i++) observer.setOptions({ ...options, enabled: false })
  expect(observer.getCurrentResult().data).toEqual({ nodes: ['root'] })
  await client.invalidateQueries({ queryKey: key(), exact: true, refetchType: 'none' })
  expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true)
  unsubscribe()
})

it('separates sheet, geometry and spatial depth while rehashing mutable filter inputs', () => {
  expect(
    new Set(
      [key(), key('other'), key('sheet', 'changed'), key('sheet', 'large geometry', 'depth')].map(
        hashNativeLayoutKey,
      ),
    ).size,
  ).toBe(4)
  const mutable = ['canvas-layout', 'sheet']
  const before = hashNativeLayoutKey(mutable)
  mutable[1] = 'other'
  expect(hashNativeLayoutKey(mutable)).not.toBe(before)
  const nested = { depth: 1 }
  const shallowFrozen = Object.freeze(['canvas-layout', nested])
  const shallowBefore = hashNativeLayoutKey(shallowFrozen)
  nested.depth = 2
  expect(hashNativeLayoutKey(shallowFrozen)).not.toBe(shallowBefore)
})
