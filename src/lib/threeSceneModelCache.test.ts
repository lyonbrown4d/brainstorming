import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@core'
import type { SpatialSceneModel } from '@renderer/lib/independentSpatialRuntime'
import { createThreeSceneModelCache } from '@renderer/lib/threeSceneModelCache'

const model = (): SpatialSceneModel => ({
  document: {
    ...createDocument('Root', 'scene-cache-tests'),
    assets: { picture: { id: 'picture', name: 'Image', mimeType: 'image/png', data: 'original' } },
    settings: { spatial: { mode: '3d', yaw: 0, pitch: 0, spacing: 100 } },
  },
  layout: { nodes: [{ id: 'root', x: 0, y: 0, width: 100, height: 40, side: 'right' }], edges: [] },
  depths: { root: 0 },
  surface: '#ffffff',
})
const pose = (source: SpatialSceneModel): SpatialSceneModel => ({
  ...structuredClone(source),
  document: {
    ...structuredClone(source.document),
    settings: {
      ...source.document.settings,
      spatial: { mode: '3d', spacing: 100, yaw: 45, pitch: 30, target: { x: 40, y: 50, z: 60 } },
    },
  },
})
const immediateCache = () => {
  const prepare = vi.fn((_model: SpatialSceneModel, complete: (success: boolean) => void) => {
    complete(true)
  })
  const reuse = vi.fn()
  return { prepare, reuse, cache: createThreeSceneModelCache({ prepare, reuse }) }
}

describe('Three scene semantic model cache', () => {
  it('preserves atlas preparation across fresh native snapshots that only change camera pose', () => {
    const { prepare, reuse, cache } = immediateCache()
    const original = model()
    cache.update(original)
    cache.update(pose(original))
    cache.update(structuredClone(original))
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(reuse).toHaveBeenCalledTimes(2)
  })

  it.each<[string, (source: SpatialSceneModel) => SpatialSceneModel]>([
    [
      'title',
      (source) => ({
        ...source,
        document: {
          ...source.document,
          topics: {
            ...source.document.topics,
            root: { id: 'root', title: 'Changed', children: [], collapsed: false, side: 'right' },
          },
        },
      }),
    ],
    [
      'topic color',
      (source) => ({
        ...source,
        document: {
          ...source.document,
          topics: {
            root: {
              id: 'root',
              title: 'Root',
              children: [],
              collapsed: false,
              side: 'right',
              style: { fill: '#123456' },
            },
          },
        },
      }),
    ],
    [
      'image bytes',
      (source) => ({
        ...source,
        document: {
          ...source.document,
          assets: {
            picture: { id: 'picture', name: 'Image', mimeType: 'image/png', data: 'replacement' },
          },
        },
      }),
    ],
    [
      'metadata',
      (source) => ({
        ...source,
        document: {
          ...source.document,
          topics: {
            root: {
              id: 'root',
              title: 'Root',
              children: [],
              collapsed: false,
              side: 'right',
              metadata: { markers: ['idea'] },
            },
          },
        },
      }),
    ],
    ['depth', (source) => ({ ...source, depths: { root: 120 } })],
    [
      'layout',
      (source) => ({
        ...source,
        layout: {
          ...source.layout,
          nodes: source.layout.nodes.map((node) => ({ ...node, x: 100 })),
        },
      }),
    ],
    [
      'theme',
      (source) => ({
        ...source,
        document: { ...source.document, settings: { ...source.document.settings, theme: 'ocean' } },
      }),
    ],
    ['surface', (source) => ({ ...source, surface: '#242424' })],
    [
      'annotations',
      (source) => ({
        ...source,
        document: { ...source.document, callouts: [{ id: 'note', topicId: 'root', text: 'Note' }] },
      }),
    ],
    [
      'ink',
      (source) => ({
        ...source,
        document: {
          ...source.document,
          drawings: [
            { id: 'ink', color: '#000000', width: 2, points: [{ x: 0, y: 0, pressure: 0.5 }] },
          ],
        },
      }),
    ],
  ])('prepares new GPU data when %s changes', (_name, change) => {
    const { cache, prepare } = immediateCache()
    const original = model()
    cache.update(original)
    cache.update(change(structuredClone(original)))
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('coalesces equivalent pending snapshots and ignores a cancelled preparation result', () => {
    const complete: ((success: boolean) => void)[] = []
    const prepare = vi.fn((_model: SpatialSceneModel, done: (success: boolean) => void) => {
      complete.push(done)
    })
    const reuse = vi.fn()
    const cache = createThreeSceneModelCache({ prepare, reuse })
    const original = model()
    cache.update(original)
    cache.update(pose(original))
    expect(prepare).toHaveBeenCalledTimes(1)
    complete[0]?.(true)
    const different = { ...original, depths: { root: 100 } }
    cache.update(different)
    cache.update(pose(original))
    expect(reuse).toHaveBeenCalledTimes(1)
    complete[1]?.(true)
    cache.update(different)
    expect(prepare).toHaveBeenCalledTimes(3)
    complete[2]?.(false)
    cache.update(different)
    expect(prepare).toHaveBeenCalledTimes(4)
    cache.clear()
    complete[3]?.(true)
    cache.update(original)
    expect(prepare).toHaveBeenCalledTimes(5)
  })
})
