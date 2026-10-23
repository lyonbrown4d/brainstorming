import { expect, it } from 'vitest'
import {
  canvasMinimapImageSource,
  createCanvasMinimapImageLoader,
  type CanvasMinimapImageEnvironment,
  type CanvasMinimapImageSource,
  type CanvasMinimapLoadedImage,
} from '@renderer/lib/canvasMinimapImage'
import type { MinimapPathGroup, MinimapRectangle } from '@renderer/lib/canvasMinimapBatch'

const rectangles: MinimapRectangle[] = [
  {
    node: { id: 'a', position: { x: 0, y: 0 }, data: {} },
    x: -12.375,
    y: 5.625,
    width: 40,
    height: 20,
  },
  {
    node: { id: 'b', position: { x: 0, y: 0 }, data: {} },
    x: 100.125,
    y: -40.875,
    width: 20,
    height: 10,
  },
]
const groups: MinimapPathGroup[] = [
  {
    id: 'a',
    fill: 'red',
    path: 'M-12.375,5.625H27.625V25.625H-12.375Z',
    count: 1,
    selected: false,
  },
  {
    id: 'b',
    fill: 'rgb(0 0 255)',
    path: 'M100.125,-40.875H120.125V-30.875H100.125Z',
    count: 1,
    selected: true,
  },
]
const source = (markup = 'svg'): CanvasMinimapImageSource => ({
  markup,
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  count: 2,
})

it('serializes ordered canonical fills with fixed raster dimensions and exact world bounds', () => {
  const image = canvasMinimapImageSource(groups, rectangles, 'crispEdges')
  expect(image).toMatchObject({ x: -12.375, y: -40.875, width: 132.5, height: 66.5, count: 2 })
  expect(image?.markup).toContain('width="512" height="512"')
  expect(image?.markup).toContain('viewBox="-12.375 -40.875 132.5 66.5" preserveAspectRatio="none"')
  expect(image?.markup).toContain('shape-rendering="crispEdges"')
  expect(image?.markup).toContain(
    '<path fill="#ff0000" d="M-12.375,5.625H27.625V25.625H-12.375Z"/>',
  )
  expect(image?.markup.indexOf('#ff0000')).toBeLessThan(image?.markup.indexOf('#0000ff') ?? 0)
})

it('rejects unresolved/translucent fills, unsafe path content and overflowing geometry', () => {
  const first = groups[0]
  const rectangle = rectangles[0]
  if (!first || !rectangle) throw new Error('Missing image fixtures')
  for (const fill of ['var(--fill)', 'rgba(1,2,3,.5)', '"><script/>'])
    expect(canvasMinimapImageSource([{ ...first, fill }], rectangles, '')).toBeNull()
  for (const path of ['MInfinity,0Z', 'M1e999,0Z', 'M0,0"/><script/>'])
    expect(canvasMinimapImageSource([{ ...first, path }], rectangles, '')).toBeNull()
  expect(
    canvasMinimapImageSource(
      groups,
      [{ ...rectangle, x: Number.MAX_VALUE, width: Number.MAX_VALUE }],
      '',
    ),
  ).toBeNull()
  expect(canvasMinimapImageSource([], rectangles, '')).toBeNull()
})

const setup = () => {
  const revoked: string[] = []
  const deferred: (() => void)[] = []
  const requests: { loaded: () => void; failed: () => void; stopped: boolean }[] = []
  const results: (CanvasMinimapLoadedImage | null)[] = []
  let sequence = 0
  const environment: CanvasMinimapImageEnvironment = {
    createUrl: () => `blob:test-${++sequence}`,
    revokeUrl: (url) => {
      revoked.push(url)
    },
    decode: (_url, loaded, failed) => {
      const request = { loaded, failed, stopped: false }
      requests.push(request)
      return () => {
        request.stopped = true
      }
    },
    defer: (callback) => {
      deferred.push(callback)
    },
  }
  return {
    environment,
    revoked,
    deferred,
    requests,
    results,
    publish: (image: CanvasMinimapLoadedImage | null) => {
      results.push(image)
    },
  }
}

it('keeps the loaded snapshot until its replacement decodes and revokes all URLs on disposal', () => {
  const state = setup()
  const loader = createCanvasMinimapImageLoader(state.environment)
  const cancel = loader.load(source('first'), state.publish)
  expect(state.results).toEqual([])
  state.requests[0]?.loaded()
  expect(state.results[0]?.source.markup).toBe('first')
  cancel()
  loader.load(source('second'), state.publish)
  expect(state.results).toHaveLength(1)
  expect(state.revoked).toEqual([])
  state.requests[1]?.loaded()
  expect(state.results[1]?.source.markup).toBe('second')
  expect(state.revoked).toEqual(['blob:test-1'])
  loader.dispose()
  expect(state.revoked).toEqual(['blob:test-1', 'blob:test-2'])
})

it('ignores stale decodes and prevents a cancelled request from publishing after unmount', () => {
  const state = setup()
  const loader = createCanvasMinimapImageLoader(state.environment)
  loader.load(source('stale'), state.publish)
  const cancel = loader.load(source('latest'), state.publish)
  expect(state.requests[0]?.stopped).toBe(true)
  state.requests[0]?.loaded()
  state.requests[0]?.failed()
  expect(state.results).toEqual([])
  cancel()
  state.requests[1]?.loaded()
  expect(state.results).toEqual([])
  expect(state.revoked).toEqual(['blob:test-1', 'blob:test-2'])
  loader.dispose()
  expect(state.revoked).toHaveLength(2)
})

it('releases failed decodes and the old image so the current paths can be rendered', () => {
  const state = setup()
  const loader = createCanvasMinimapImageLoader(state.environment)
  loader.load(source('first'), state.publish)
  state.requests[0]?.loaded()
  loader.load(source('broken'), state.publish)
  state.requests[1]?.failed()
  expect(state.results.at(-1)).toBeNull()
  expect(state.revoked).toEqual(['blob:test-2', 'blob:test-1'])
  loader.dispose()
  expect(state.revoked).toHaveLength(2)
})

it('handles decoder setup failure asynchronously and cancels its queued fallback', () => {
  const state = setup()
  const loader = createCanvasMinimapImageLoader({
    ...state.environment,
    decode: () => {
      throw new Error('Decoder unavailable')
    },
  })
  loader.load(source('failed'), state.publish)
  expect(state.results).toEqual([])
  state.deferred.shift()?.()
  expect(state.results).toEqual([null])
  const cancel = loader.load(source('cancelled'), state.publish)
  cancel()
  state.deferred.shift()?.()
  expect(state.results).toEqual([null])
  expect(state.revoked).toEqual(['blob:test-1', 'blob:test-2'])
})
