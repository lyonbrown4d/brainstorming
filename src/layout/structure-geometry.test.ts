import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createExampleDocument,
  createFixtureDocument,
  LAYOUT_KINDS,
  type LayoutKind,
  type MindMapDocument,
} from '@core'
import { layoutDocument, type LayoutNode, type MindMapLayout } from '@layout'

const node = (layout: MindMapLayout, id: string): LayoutNode => {
  const found = layout.nodes.find((item) => item.id === id)
  if (!found) throw new Error(`Missing topic: ${id}`)
  return found
}
const withLayout = (kind: LayoutKind): MindMapDocument => {
  return { ...createExampleDocument(), settings: { layout: kind } }
}
const center = (item: LayoutNode): { x: number; y: number } => {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}
const contains = (
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): void => {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 0.001)
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 0.001)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.001)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.001)
}

describe('structure-specific geometry', () => {
  it.each(['tree-down', 'tree-up'] as const)(
    '%s aligns parent and first-child edges while org charts center sibling tiers',
    (kind) => {
      const document = withLayout(kind)
      const tree = layoutDocument(document)
      for (const topic of Object.values(document.topics)) {
        const first = topic.children[0]
        if (first) expect(node(tree, topic.id).x).toBe(node(tree, first).x)
      }
      const org = layoutDocument(withLayout(kind === 'tree-down' ? 'org-down' : 'org-up'))
      expect(node(org, 'root').x).not.toBe(node(org, 'vision').x)
      expect(center(node(tree, 'vision')).y * (kind === 'tree-up' ? -1 : 1)).toBeGreaterThan(0)
    },
  )

  it.each(['brace-right', 'brace-left'] as const)(
    '%s draws one sized bracket for each sibling group',
    (kind) => {
      const document = withLayout(kind)
      const layout = layoutDocument(document)
      expect(layout.edges.every((edge) => edge.routing === 'hidden')).toBe(true)
      for (const topic of Object.values(document.topics).filter((topic) => topic.children.length)) {
        const brace = layout.decorations?.find((item) => item.topicId === topic.id)
        expect(brace?.kind).toBe('brace')
        if (!brace) throw new Error('Missing brace')
        for (const id of topic.children) {
          const child = node(layout, id)
          expect(brace.y).toBeLessThanOrEqual(child.y)
          expect(brace.y + brace.height).toBeGreaterThanOrEqual(child.y + child.height)
          if (kind === 'brace-right') expect(brace.x + brace.width).toBeLessThan(child.x)
          else expect(brace.x).toBeGreaterThan(child.x + child.width)
        }
      }
    },
  )

  it('places ordered events on horizontal/vertical spines and slanted fishbone ribs', () => {
    for (const kind of ['timeline', 'timeline-vertical', 'fishbone'] as const) {
      const document = withLayout(kind)
      const layout = layoutDocument(document)
      const spine = layout.decorations?.find((item) => item.kind === 'spine')
      expect(spine).toBeDefined()
      const children = document.topics.root?.children ?? []
      let previous = 0
      for (const id of children) {
        const point = center(node(layout, id))
        if (kind === 'timeline-vertical') {
          expect(point.x).toBe(0)
          expect(point.y).toBeGreaterThan(previous)
          previous = point.y
        } else {
          expect(point.x).toBeGreaterThan(previous)
          previous = point.x
          if (kind === 'timeline') expect(point.y).toBe(0)
          else {
            const edge = layout.edges.find((item) => item.target === id)
            expect(edge?.routing).toBe('straight')
            expect(edge?.waypoints?.[0]?.y).toBe(0)
            expect(edge?.waypoints?.[0]?.x).toBeGreaterThan(point.x)
            expect(edge?.waypoints?.[1]?.y).not.toBe(0)
          }
        }
      }
      expect(kind === 'timeline-vertical' ? spine?.width : spine?.height).toBe(0)
    }
  })

  it('uses root children as matrix columns with shared ordered row bands and contains deeper descendants', () => {
    let document = withLayout('matrix')
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'vision-0',
      id: 'deep',
      title: 'Contained deep content',
    })
    const layout = layoutDocument(document)
    const rootChildren = document.topics.root?.children ?? []
    let previousX = -Infinity
    let headerY: number | undefined
    const rowY = new Map<number, number>()
    for (const id of rootChildren) {
      const header = node(layout, id)
      expect(header.x).toBeGreaterThan(previousX)
      previousX = header.x
      headerY ??= center(header).y
      expect(center(header).y).toBe(headerY)
      for (const [index, rowId] of (document.topics[id]?.children ?? []).entries()) {
        const cell = layout.decorations?.find((item) => item.id === `cell-${rowId}`)
        if (!cell) throw new Error('Missing matrix cell')
        rowY.set(index, rowY.get(index) ?? cell.y)
        expect(cell.y).toBe(rowY.get(index))
        contains(cell, node(layout, rowId))
        if (rowId === 'vision-0') contains(cell, node(layout, 'deep'))
      }
    }
    expect(layout.edges.find((edge) => edge.target === 'deep')?.routing).toBe('orthogonal')
  })

  it.each(['tree-table-right', 'tree-table-down'] as const)(
    '%s gives every topic a spanning cell containing its card and child bands',
    (kind) => {
      const document = withLayout(kind)
      const layout = layoutDocument(document)
      expect(layout.decorations).toHaveLength(layout.nodes.length)
      expect(layout.edges.every((edge) => edge.routing === 'hidden')).toBe(true)
      const cells = new Map(layout.decorations?.map((cell) => [cell.topicId, cell]))
      for (const topic of Object.values(document.topics)) {
        const cell = cells.get(topic.id)
        if (!cell) throw new Error('Missing tree table cell')
        contains(cell, node(layout, topic.id))
        for (const id of topic.children) {
          const child = cells.get(id)
          if (!child) throw new Error('Missing child cell')
          if (kind === 'tree-table-right') {
            expect(child.x).toBeCloseTo(cell.x + cell.width)
            expect(child.y).toBeGreaterThanOrEqual(cell.y - 0.001)
            expect(child.y + child.height).toBeLessThanOrEqual(cell.y + cell.height + 0.001)
          } else {
            expect(child.y).toBeCloseTo(cell.y + cell.height)
            expect(child.x).toBeGreaterThanOrEqual(cell.x - 0.001)
            expect(child.x + child.width).toBeLessThanOrEqual(cell.x + cell.width + 0.001)
          }
        }
      }
    },
  )

  it('translates mixed/floating decorations and ribs together and terminates ribs on nested root cards', () => {
    const document = applyCommand(withLayout('fishbone'), {
      type: 'batch',
      commands: [
        { type: 'setTopicStructure', topicId: 'vision', structure: 'tree-table-right' },
        { type: 'addFloatingTopic', id: 'floating', title: 'Floating', x: 3000, y: -900 },
        { type: 'setTopicStructure', topicId: 'floating', structure: 'fishbone' },
        { type: 'addTopic', parentId: 'floating', id: 'floating-child', title: 'Child' },
      ],
    })
    const layout = layoutDocument(document)
    const vision = node(layout, 'vision')
    const cell = layout.decorations?.find((item) => item.id === 'cell-vision')
    if (!cell) throw new Error('Missing nested cell')
    contains(cell, vision)
    const endpoint = layout.edges.find((edge) => edge.target === 'vision')?.waypoints?.at(-1)
    expect(endpoint).toEqual({ x: center(vision).x, y: vision.y + vision.height })
    const floating = node(layout, 'floating')
    expect(floating).toMatchObject({ x: 3000, y: -900 })
    const spine = layout.decorations?.find((item) => item.id === 'spine-floating')
    expect(spine?.y).toBe(center(floating).y)
    expect(layout.edges.find((edge) => edge.target === 'floating-child')?.waypoints?.[0]?.y).toBe(
      spine?.y,
    )
  })

  it.each(LAYOUT_KINDS)('keeps %s finite for a deep 1,000-topic chain', (kind) => {
    const layout = layoutDocument({
      ...createFixtureDocument(1000, 'deep'),
      settings: { layout: kind },
    })
    const ordered = [...layout.nodes].sort((a, b) => a.x - b.x)
    for (const [index, a] of ordered.entries())
      for (let next = index + 1; next < ordered.length; next += 1) {
        const b = ordered[next]
        if (!b || b.x >= a.x + a.width) break
        if (a.y < b.y + b.height && b.y < a.y + a.height)
          throw new Error(`Overlapping deep topics: ${a.id}/${b.id}`)
      }
    expect(layout.nodes).toHaveLength(1000)
    expect(layout.edges).toHaveLength(999)
    expect(layout.nodes.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(
      true,
    )
    expect(
      (layout.decorations ?? []).every((item) =>
        [item.x, item.y, item.width, item.height].every(Number.isFinite),
      ),
    ).toBe(true)
  })
})
