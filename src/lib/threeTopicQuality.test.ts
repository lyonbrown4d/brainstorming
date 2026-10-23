import { CanvasTexture, Group } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@core'
import type * as TopicAtlas from '@renderer/lib/threeTopicAtlas'
import { prepareThreeTopicAtlas, type ThreeTopicAtlas } from '@renderer/lib/threeTopicAtlas'
import { packTopicAtlas } from '@renderer/lib/threeTopicAtlasLayout'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { createThreeTopicQuality } from '@renderer/lib/threeTopicQuality'

vi.mock('@renderer/lib/threeTopicAtlas', async (importOriginal) => ({
  ...(await importOriginal<typeof TopicAtlas>()),
  prepareThreeTopicAtlas: vi.fn(),
}))
const fixture = () => {
  const node = { id: 'root', x: 0, y: 0, width: 200, height: 80, side: 'right' as const }
  const runtime = createIndependentSpatialRuntime({
    document: createDocument('Root', 'detail-tests'),
    layout: { nodes: [node], edges: [] },
    depths: { root: 0 },
    surface: '#ffffff',
  })
  runtime.canvas = {
    width: 2000,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
  } as HTMLCanvasElement
  const rectangles = vi
    .spyOn(runtime, 'rectangles')
    .mockReturnValue([
      { id: 'root', kind: 'topic', x: 0, y: 0, width: 600, height: 240, depth: 100 },
    ])
  const overview: ThreeTopicAtlas = {
    tiles: packTopicAtlas([node]),
    textures: [],
    dispose: vi.fn(),
  }
  const base = { setExcluded: vi.fn() }
  const renderer = { initTexture: vi.fn() }
  const host = new Group()
  const quality = createThreeTopicQuality({
    runtime,
    overview,
    base,
    renderer,
    host,
    selected: () => new Set(),
  })
  return { quality, base, renderer, rectangles, host, runtime, overview }
}
const atlas = (tiles: ThreeTopicAtlas['tiles']): ThreeTopicAtlas => ({
  tiles,
  textures: [new CanvasTexture()],
  dispose: vi.fn(),
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.mocked(prepareThreeTopicAtlas).mockReset()
})

describe('atomic spatial topic detail layer', () => {
  it('keeps the overview until the prepared texture can be uploaded and reuses density buckets', async () => {
    vi.useFakeTimers()
    const value = fixture()
    let complete: ((result: ThreeTopicAtlas) => void) | undefined
    vi.mocked(prepareThreeTopicAtlas).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    value.quality.request()
    await vi.advanceTimersByTimeAsync(180)
    expect(value.base.setExcluded).not.toHaveBeenCalled()
    const prepared = atlas(vi.mocked(prepareThreeTopicAtlas).mock.calls[0]?.[3] ?? [])
    complete?.(prepared)
    await vi.advanceTimersByTimeAsync(0)
    expect(value.renderer.initTexture).toHaveBeenCalledWith(prepared.textures[0])
    expect(value.base.setExcluded).toHaveBeenLastCalledWith(new Set(['root']))
    value.quality.request()
    await vi.advanceTimersByTimeAsync(800)
    expect(prepareThreeTopicAtlas).toHaveBeenCalledTimes(1)
    value.quality.invalidate()
    expect(value.base.setExcluded).toHaveBeenLastCalledWith(new Set())
    expect(prepared.dispose).toHaveBeenCalledTimes(1)
    value.quality.dispose()
    expect(value.host.children).toHaveLength(0)
  })

  it('disposes a cancelled preparation without ever hiding the overview or showing stale content', async () => {
    vi.useFakeTimers()
    const value = fixture()
    let complete: ((result: ThreeTopicAtlas) => void) | undefined
    vi.mocked(prepareThreeTopicAtlas).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    value.quality.request()
    await vi.advanceTimersByTimeAsync(180)
    const signal = vi.mocked(prepareThreeTopicAtlas).mock.calls[0]?.[2]
    const stale = atlas(vi.mocked(prepareThreeTopicAtlas).mock.calls[0]?.[3] ?? [])
    value.quality.invalidate()
    expect(signal?.aborted).toBe(true)
    complete?.(stale)
    await vi.advanceTimersByTimeAsync(0)
    expect(stale.dispose).toHaveBeenCalledTimes(1)
    expect(value.renderer.initTexture).not.toHaveBeenCalled()
    expect(value.base.setExcluded).not.toHaveBeenCalled()
    value.quality.dispose()
  })
})
