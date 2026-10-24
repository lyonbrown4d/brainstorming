import { CanvasTexture, type InstancedBufferAttribute } from 'three'
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

  it('updates only changed selection components across atlas pages and preserves pending changes', () => {
    const { batch, textures } = createBatch(1000)
    batch.update(new Set(['topic-0']))
    const attributes = batch.meshes.map(({ geometry }) => ({
      center: geometry.getAttribute('center') as InstancedBufferAttribute,
      size: geometry.getAttribute('size') as InstancedBufferAttribute,
      selected: geometry.getAttribute('selected') as InstancedBufferAttribute,
    }))
    for (const entry of attributes) {
      for (const attribute of Object.values(entry)) attribute.onUploadCallback()
    }
    const geometryVersions = attributes.map(({ center, size }) => [center.version, size.version])
    batch.updateSelection(new Set(['topic-999']))
    expect(attributes.map(({ center, size }) => [center.version, size.version])).toEqual(
      geometryVersions,
    )
    expect(attributes.flatMap(({ selected }) => selected.updateRanges)).toHaveLength(2)
    expect(attributes.flatMap(({ selected }) => [...selected.array]).filter(Boolean)).toEqual([1])
    const selectionVersions = attributes.map(({ selected }) => selected.version)
    batch.updateSelection(new Set(['topic-999']))
    expect(attributes.map(({ selected }) => selected.version)).toEqual(selectionVersions)
    batch.updateSelection(new Set(['topic-500']))
    batch.updateSelection(new Set(['topic-0']))
    expect(attributes.flatMap(({ selected }) => selected.updateRanges)).toHaveLength(6)
    expect(attributes[0]?.selected.getX(0)).toBe(1)
    expect(attributes.flatMap(({ selected }) => [...selected.array]).filter(Boolean)).toEqual([1])
    expect(attributes.map(({ center, size }) => [center.version, size.version])).toEqual(
      geometryVersions,
    )
    batch.dispose()
    textures.forEach((texture) => {
      texture.dispose()
    })
  })

  it('preserves selection and drop highlights while geometry and detail exclusion change', () => {
    const { runtime, batch, textures } = createBatch(2)
    batch.update(new Set(['topic-0']))
    const geometry = batch.meshes[0]?.geometry
    if (!geometry) throw new Error('Missing batch geometry')
    const selected = geometry.getAttribute('selected')
    runtime.dropTarget = 'topic-0'
    batch.updateSelection(new Set(['topic-0']))
    expect(selected.getX(0)).toBe(2)
    runtime.dropTarget = 'topic-1'
    runtime.offsets.set('topic-0', { x: 10, y: 20, z: 30 })
    runtime.scales.set('topic-0', 2)
    batch.setExcluded(new Set(['topic-0']))
    batch.update(new Set(['topic-0']))
    expect([selected.getX(0), selected.getX(1)]).toEqual([1, 2])
    expect(geometry.getAttribute('center').getX(0)).toBe(66)
    expect(geometry.getAttribute('size').getX(0)).toBe(0)
    batch.setExcluded(new Set())
    runtime.dropTarget = null
    batch.updateSelection(new Set())
    expect([selected.getX(0), selected.getX(1)]).toEqual([0, 0])
    expect(geometry.getAttribute('size').getX(0)).toBe(240)
    expect(geometry.getAttribute('center').getZ(0)).toBe(130)
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
