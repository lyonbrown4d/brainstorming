import { CanvasTexture } from 'three'
import { describe, expect, it } from 'vitest'
import { createDocument } from '@core'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { packTopicAtlas } from '@renderer/lib/threeTopicAtlasLayout'
import { createThreeTopicBatches } from '@renderer/lib/threeTopicBatch'
import { threeTopicTitleRuns } from '@renderer/lib/threeTopicRichText'

const createBatch = (count: number) => {
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: `topic-${index}`,
    x: index * 150,
    y: index * 10,
    width: 112,
    height: 44,
    side: 'right' as const,
  }))
  const runtime = createIndependentSpatialRuntime({
    document: createDocument('Root', 'batch-tests'),
    layout: { nodes, edges: [] },
    depths: { 'topic-0': 100 },
    surface: '#ffffff',
  })
  const tiles = packTopicAtlas(nodes)
  const textures = Array.from({ length: (tiles.at(-1)?.page ?? -1) + 1 }, () => new CanvasTexture())
  const batch = createThreeTopicBatches({ tiles, textures, dispose: () => undefined }, runtime)
  return { runtime, batch, textures }
}

describe('independent topic GPU batches', () => {
  it('renders one thousand billboards in at most four shared mesh batches', () => {
    const { batch, textures } = createBatch(1000)
    expect(batch.meshes.length).toBeLessThanOrEqual(4)
    expect(batch.meshes.reduce((sum, mesh) => sum + mesh.geometry.instanceCount, 0)).toBe(1000)
    batch.dispose()
    textures.forEach((texture) => {
      texture.dispose()
    })
  })

  it('updates drag, scale, editor hiding and drop flags without repainting the atlas', () => {
    const { runtime, batch, textures } = createBatch(1)
    const beforeVersion = textures[0]?.version
    runtime.offsets.set('topic-0', { x: 10, y: 20, z: 30 })
    runtime.scales.set('topic-0', 2)
    runtime.dropTarget = 'topic-0'
    batch.update(new Set(['topic-0']))
    const geometry = batch.meshes[0]?.geometry
    if (!geometry) throw new Error('Missing batch geometry')
    const center = geometry.getAttribute('center')
    expect([center.getX(0), center.getY(0), center.getZ(0)]).toEqual([66, -42, 130])
    expect(geometry.getAttribute('size').getX(0)).toBe(240)
    expect(geometry.getAttribute('selected').getX(0)).toBe(2)
    runtime.hiddenTopics.add('topic-0')
    batch.update(new Set())
    expect(geometry.getAttribute('size').getX(0)).toBe(0)
    batch.setExcluded(new Set(['topic-0']))
    batch.setExcluded(new Set())
    expect(geometry.getAttribute('size').getX(0)).toBe(0)
    runtime.hiddenTopics.clear()
    batch.update(new Set())
    expect(geometry.getAttribute('size').getX(0)).toBe(240)
    expect(textures[0]?.version).toBe(beforeVersion)
    expect(runtime.model.layout.nodes[0]?.x).toBe(0)
    batch.dispose()
    textures.forEach((texture) => {
      texture.dispose()
    })
  })

  it('preserves portable rich title spans and falls back for a stale rich source', () => {
    const topic = {
      id: 'root',
      title: 'Bold italic code',
      children: [],
      collapsed: false,
      side: 'right' as const,
      metadata: { richTitle: '**Bold** *italic* `code`' },
    }
    const runs = threeTopicTitleRuns(topic)
    expect(runs.find((run) => run.text === 'Bold')?.bold).toBe(true)
    expect(runs.find((run) => run.text === 'italic')?.italic).toBe(true)
    expect(runs.find((run) => run.text === 'code')?.code).toBe(true)
    expect(threeTopicTitleRuns({ ...topic, title: 'Changed' })).toEqual([])
  })
})
