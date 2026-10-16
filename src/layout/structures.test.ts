import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createExampleDocument,
  createFixtureDocument,
  getVisibleTopicIds,
  LAYOUT_KINDS,
  type MindMapDocument,
  type Topic,
} from '@core'
import { layoutDocument, measureTopic, type LayoutNode } from './index'
import { layoutSpatialDocument } from './spatial'

function assertNoOverlap(nodes: readonly LayoutNode[]): void {
  const ordered = [...nodes].sort((a, b) => a.x - b.x)
  for (const [index, a] of ordered.entries()) {
    for (let next = index + 1; next < ordered.length; next += 1) {
      const b = ordered[next]
      if (!b || b.x >= a.x + a.width) break
      if (a.y < b.y + b.height && b.y < a.y + a.height) throw new Error(`Overlap: ${a.id}/${b.id}`)
    }
  }
}
function wideFixture(count: number): MindMapDocument {
  const document = createFixtureDocument(count)
  const topics: Record<string, Topic> = {}
  const children = Object.keys(document.topics).filter((id) => id !== document.rootId)
  for (const topic of Object.values(document.topics))
    topics[topic.id] = { ...topic, children: topic.id === document.rootId ? children : [] }
  return { ...document, topics }
}
function finite(document: MindMapDocument): void {
  const layout = layoutDocument(document)
  expect(new Set(layout.nodes.map(({ id }) => id))).toEqual(new Set(getVisibleTopicIds(document)))
  expect(
    layout.nodes.every((node) => [node.x, node.y, node.width, node.height].every(Number.isFinite)),
  ).toBe(true)
  expect(
    layout.edges.every(
      ({ source, target }) =>
        layout.nodes.some(({ id }) => id === source) &&
        layout.nodes.some(({ id }) => id === target),
    ),
  ).toBe(true)
  assertNoOverlap(layout.nodes)
}

describe('document and mixed subtree structures', () => {
  it.each(LAYOUT_KINDS)(
    'lays out %s deterministically without missing or overlapping topics',
    (kind) => {
      const document = applyCommand(createExampleDocument(), {
        type: 'setDocumentSettings',
        settings: { layout: kind },
      })
      const original = JSON.stringify(document)
      finite(document)
      expect(layoutDocument(document)).toEqual(layoutDocument(document))
      const collapsed = applyCommand(document, { type: 'toggleCollapse', topicId: 'vision' })
      finite(collapsed)
      expect(layoutDocument(collapsed).nodes.some(({ id }) => id === 'vision-0')).toBe(false)
      expect(JSON.stringify(document)).toBe(original)
    },
  )

  it('keeps logic and organization branches on their requested axis and gives spine layouts distinct ordered rows', () => {
    const document = createExampleDocument()
    for (const [kind, axis, sign] of [
      ['logic-right', 'x', 1],
      ['logic-left', 'x', -1],
      ['org-down', 'y', 1],
      ['org-up', 'y', -1],
    ] as const) {
      const layout = layoutDocument({ ...document, settings: { layout: kind } })
      for (const node of layout.nodes.filter(({ id }) => id !== 'root'))
        expect((node[axis] + (axis === 'x' ? node.width : node.height) / 2) * sign).toBeGreaterThan(
          0,
        )
    }
    const timeline = layoutDocument({ ...document, settings: { layout: 'timeline' } })
    const branches =
      document.topics.root?.children.map((id) => timeline.nodes.find((node) => node.id === id)) ??
      []
    expect(branches.every((node) => node && node.y + node.height / 2 === 0)).toBe(true)
    expect(branches.map((node) => node?.x)).toEqual(
      branches.map((node) => node?.x).sort((a = 0, b = 0) => a - b),
    )
    const fishbone = layoutDocument({ ...document, settings: { layout: 'fishbone' } })
    const bones =
      document.topics.root?.children.map((id) => fishbone.nodes.find((node) => node.id === id)) ??
      []
    expect(bones.map((node) => Math.sign((node?.y ?? 0) + (node?.height ?? 0) / 2))).toEqual([
      -1, 1, -1, 1,
    ])
  })

  it('composes nested mixed subtree boxes without invading sibling components and exposes per-edge incoming direction', () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'batch',
      commands: [
        { type: 'setDocumentSettings', settings: { layout: 'logic-right' } },
        { type: 'setTopicStructure', topicId: 'vision', structure: 'org-down' },
        { type: 'setTopicStructure', topicId: 'vision-0', structure: 'logic-left' },
        {
          type: 'addTopic',
          parentId: 'vision-0',
          id: 'mixed-leaf',
          title: '更长的混合分支标题'.repeat(8),
        },
        { type: 'setTopicStructure', topicId: 'users', structure: 'fishbone' },
        { type: 'setTopicStructure', topicId: 'experience', structure: 'timeline' },
        { type: 'setTopicStructure', topicId: 'plan', structure: 'matrix' },
      ],
    })
    finite(document)
    const layout = layoutDocument(document)
    expect(layout.edges.find(({ target }) => target === 'vision')?.direction).toBe('right')
    expect(layout.edges.find(({ target }) => target === 'vision-1')?.direction).toBe('down')
    expect(layout.edges.find(({ target }) => target === 'mixed-leaf')?.direction).toBe('left')
    expect(layout.nodes.find(({ id }) => id === 'vision')?.direction).toBe('down')
  })

  it.each(['logic-right', 'matrix'] as const)(
    'handles an iterative 5,000-level %s tree',
    (layout) => {
      const document = { ...createFixtureDocument(5000, 'deep'), settings: { layout } }
      const result = layoutDocument(document)
      expect(result.nodes).toHaveLength(5000)
      expect(result.edges).toHaveLength(4999)
      expect(result.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
      assertNoOverlap(result.nodes)
    },
  )

  it.each(['org-down', 'matrix'] as const)('handles a 5,000-topic wide %s tree', (layout) => {
    const document = { ...wideFixture(5000), settings: { layout } }
    const result = layoutDocument(document)
    expect(result.nodes).toHaveLength(5000)
    expect(result.edges).toHaveLength(4999)
    expect(result.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    assertNoOverlap(result.nodes)
  })

  it('composes 1,500 alternating deep subtree overrides without a recursive layout stack', () => {
    const document = createFixtureDocument(1500, 'deep')
    const topics = Object.fromEntries(
      Object.values(document.topics).map((topic, index) => [
        topic.id,
        { ...topic, structure: index % 2 === 0 ? ('logic-right' as const) : ('org-down' as const) },
      ]),
    )
    const result = layoutDocument({ ...document, topics })
    expect(result.nodes).toHaveLength(1500)
    expect(result.edges).toHaveLength(1499)
    expect(result.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    assertNoOverlap(result.nodes)
  })

  it('reserves a single metadata badge row while keeping image and notes dimensions compatible', () => {
    const plain = measureTopic('Title')
    const metadata = {
      labels: ['A', 'B'],
      markers: ['star'],
      task: { done: false },
      equation: 'x^2',
    }
    expect(measureTopic('Title', false, undefined, { metadata }).height).toBe(plain.height + 28)
    expect(
      measureTopic('Title', false, undefined, {
        metadata: { richTitle: '**Title**', notesFormat: 'markdown' },
      }),
    ).toEqual(plain)
    const image = { assetId: 'image', width: 200, height: 100 }
    const before = measureTopic('Title', false, undefined, { image, notes: 'Notes' })
    expect(
      measureTopic('Title', false, undefined, { image, notes: 'Notes', metadata }).height,
    ).toBe(before.height + 28)
  })
})

describe('independent floating roots and spatial projection', () => {
  it('uses saved top-left floating positions, omits virtual root edges and keeps floating roots visible when the center collapses', () => {
    const source = createExampleDocument()
    const document = applyCommand(source, {
      type: 'batch',
      commands: [
        { type: 'addFloatingTopic', id: 'floating', title: 'Independent', x: -900, y: 450 },
        { type: 'addTopic', parentId: 'floating', id: 'floating-child', title: 'Child' },
      ],
    })
    const result = layoutDocument(document)
    expect(result.nodes.find(({ id }) => id === 'floating')).toMatchObject({ x: -900, y: 450 })
    expect(result.edges.some(({ target }) => target === 'floating')).toBe(false)
    expect(result.edges.find(({ target }) => target === 'floating-child')?.source).toBe('floating')
    const original = new Map(
      layoutDocument(source).nodes.map((node) => [node.id, [node.x, node.y]]),
    )
    for (const node of result.nodes.filter(({ id }) => original.has(id)))
      expect([node.x, node.y]).toEqual(original.get(node.id))
    const spatialBefore = new Map(
      layoutSpatialDocument(source).nodes.map(({ id, position }) => [id, position]),
    )
    for (const { id, position } of layoutSpatialDocument(document).nodes)
      if (spatialBefore.has(id)) expect(position).toEqual(spatialBefore.get(id))
    const collapsed = applyCommand(document, { type: 'toggleCollapse', topicId: 'root' })
    expect(layoutDocument(collapsed).nodes.map(({ id }) => id)).toEqual([
      'root',
      'floating',
      'floating-child',
    ])
    expect(getVisibleTopicIds(collapsed)).toEqual(['root', 'floating', 'floating-child'])
    expect(layoutSpatialDocument(collapsed).nodes.map(({ id }) => id)).toEqual([
      'root',
      'floating',
      'floating-child',
    ])
  })

  it.each(LAYOUT_KINDS)(
    'projects %s and independently positioned floating branches to finite spatial bounds',
    (layout) => {
      const document = applyCommand(createExampleDocument(), {
        type: 'batch',
        commands: [
          { type: 'setDocumentSettings', settings: { layout } },
          { type: 'addFloatingTopic', id: 'floating', title: 'Floating', x: 3000, y: -400 },
        ],
      })
      const spatial = layoutSpatialDocument(document)
      expect(spatial.nodes).toHaveLength(14)
      expect(spatial.edges).toHaveLength(12)
      expect(
        spatial.nodes.every(({ position, width, height }) =>
          [...position, width, height].every(Number.isFinite),
        ),
      ).toBe(true)
      expect([...spatial.bounds.min, ...spatial.bounds.max].every(Number.isFinite)).toBe(true)
    },
  )
})
