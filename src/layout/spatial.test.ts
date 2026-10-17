import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createExampleDocument,
  createFixtureDocument,
  getVisibleTopicIds,
} from '@core'
import type { MindMapDocument, Topic } from '@core'
import { layoutSpatialDocument, spatialBounds, spatialSubtreeIds } from '@layout/spatial'
import type { SpatialNode } from '@layout/spatial'

const assertFrontProjectionIsLegible = (nodes: readonly SpatialNode[]): void => {
  // Camera at [0, 5, 18], looking at the origin; perspective scale cancels here.
  const distance = Math.hypot(5, 18)
  const projected = nodes.map((node) => {
    const [x, y, z] = node.position
    const depth = distance - (y * 5 + z * 18) / distance
    return {
      id: node.id,
      x: x / depth,
      y: (y * 18 - z * 5) / distance / depth,
      width: node.width / depth,
      height: node.height / depth,
    }
  })
  for (const [index, a] of projected.entries()) {
    for (const b of projected.slice(index + 1)) {
      const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2
      const overlapY = Math.abs(a.y - b.y) < (a.height + b.height) / 2
      expect(overlapX && overlapY, `${a.id} / ${b.id}`).toBe(false)
    }
  }
}

const wideFixture = (count: number): MindMapDocument => {
  const document = createFixtureDocument(count)
  const topics: Record<string, Topic> = {}
  const children = Object.keys(document.topics).filter((id) => id !== document.rootId)
  for (const topic of Object.values(document.topics)) {
    topics[topic.id] = { ...topic, children: topic.id === document.rootId ? children : [] }
  }
  return { ...document, topics }
}

describe('spatial tree layout', () => {
  it('preserves topic identity and order in deterministic, legible branch layers', () => {
    const document = createExampleDocument()
    const original = JSON.stringify(document)
    const layout = layoutSpatialDocument(document)
    const root = layout.nodes.find((node) => node.id === document.rootId)
    expect(root).toMatchObject({ position: [0, 0, 0], branchId: 'root', depth: 0 })
    expect(layout).toEqual(layoutSpatialDocument(document))
    expect(JSON.stringify(document)).toBe(original)
    expect(layout.nodes).toHaveLength(13)
    expect(layout.edges).toHaveLength(12)
    const branches = layout.nodes.filter((node) => node.depth === 1)
    expect(new Set(branches.map((node) => node.position[2])).size).toBe(4)
    for (const node of layout.nodes) {
      if (node.depth === 0) continue
      const topic = document.topics[node.id]
      expect(topic?.side === 'left' ? node.position[0] < 0 : node.position[0] > 0).toBe(true)
      expect(spatialSubtreeIds(document, node.branchId).has(node.id)).toBe(true)
    }
    const ordered = ['vision-0', 'vision-1'].map(
      (id) => layout.nodes.find((node) => node.id === id)?.position[1] ?? 0,
    )
    expect(ordered[0]).toBeGreaterThan(ordered[1] ?? 0)
    assertFrontProjectionIsLegible(layout.nodes)
  })

  it('omits collapsed descendants and links while retaining them in subtree selection', () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'toggleCollapse',
      topicId: 'vision',
    })
    const layout = layoutSpatialDocument(document)
    const visible = new Set(getVisibleTopicIds(document))
    expect(new Set(layout.nodes.map((node) => node.id))).toEqual(visible)
    expect(layout.edges.every((edge) => visible.has(edge.source) && visible.has(edge.target))).toBe(
      true,
    )
    expect(spatialSubtreeIds(document, 'vision')).toEqual(
      new Set(['vision', 'vision-0', 'vision-1']),
    )
    const hiddenEdit = applyCommand(document, {
      type: 'renameTopic',
      topicId: 'vision-0',
      title: '隐藏后代的更长标题',
    })
    expect(layoutSpatialDocument(hiddenEdit)).toEqual(layout)
    const rootOnly = layoutSpatialDocument(
      applyCommand(document, { type: 'toggleCollapse', topicId: 'root' }),
    )
    expect(rootOnly.nodes).toHaveLength(1)
    expect(rootOnly.edges).toEqual([])
    const root = rootOnly.nodes[0]
    expect(rootOnly.bounds).toEqual({
      min: [-(root?.width ?? 0) / 2, -(root?.height ?? 0) / 2, 0],
      max: [(root?.width ?? 0) / 2, (root?.height ?? 0) / 2, 0],
    })
    expect(spatialBounds([])).toEqual({ min: [0, 0, 0], max: [0, 0, 0] })
  })

  it('reserves measured image and detail space in world units and camera bounds', () => {
    const plain = createExampleDocument()
    const image = applyCommand(plain, {
      type: 'setTopicImage',
      topicId: 'vision',
      asset: { id: 'image', name: '图.png', mimeType: 'image/png', data: 'AA==' },
      width: 400,
      height: 200,
    })
    const document = applyCommand(image, {
      type: 'setTopicNotes',
      topicId: 'vision',
      notes: '备注',
    })
    const before = layoutSpatialDocument(plain).nodes.find((node) => node.id === 'vision')
    const layout = layoutSpatialDocument(document)
    const after = layout.nodes.find((node) => node.id === 'vision')
    expect((after?.height ?? 0) - (before?.height ?? 0)).toBeCloseTo(1.4)
    expect(after?.width).toBeGreaterThanOrEqual(2)
    for (const node of layout.nodes) {
      const [x, y, z] = node.position
      expect(x - node.width / 2).toBeGreaterThanOrEqual(layout.bounds.min[0])
      expect(x + node.width / 2).toBeLessThanOrEqual(layout.bounds.max[0])
      expect(y - node.height / 2).toBeGreaterThanOrEqual(layout.bounds.min[1])
      expect(y + node.height / 2).toBeLessThanOrEqual(layout.bounds.max[1])
      expect(z).toBeGreaterThanOrEqual(layout.bounds.min[2])
      expect(z).toBeLessThanOrEqual(layout.bounds.max[2])
    }
    assertFrontProjectionIsLegible(layout.nodes)
  })

  it.each(['balanced', 'deep', 'wide'] as const)(
    'keeps all 5,000 topics finite and connected for a %s tree',
    (shape) => {
      const document = shape === 'wide' ? wideFixture(5_000) : createFixtureDocument(5_000, shape)
      const layout = layoutSpatialDocument(document)
      const ids = new Set(layout.nodes.map((node) => node.id))
      expect(ids).toEqual(new Set(Object.keys(document.topics)))
      expect(layout.edges).toHaveLength(4_999)
      expect(new Set(layout.edges.map((edge) => edge.target))).toEqual(
        new Set([...ids].filter((id) => id !== document.rootId)),
      )
      expect(layout.edges.every((edge) => ids.has(edge.source))).toBe(true)
      expect(
        layout.nodes.every((node) =>
          [...node.position, node.width, node.height].every(Number.isFinite),
        ),
      ).toBe(true)
      expect([...layout.bounds.min, ...layout.bounds.max].every(Number.isFinite)).toBe(true)
    },
  )
})
