// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { applyCommand, createExampleDocument, LAYOUT_KINDS, type LayoutKind } from '@core'
import { layoutDocument } from './index'
import {
  layoutSpatialDocument,
  spatialBounds,
  spatialSubtreeIds,
  type SpatialPoint,
} from './spatial'
import { spatialFramingNodes } from './spatial-geometry'
import { layoutDecorationPath } from '../shared/layout-geometry'

const numbers = (path: string): number[] =>
  (path.match(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi) ?? []).map(Number)
const loader = new SVGLoader()
const documentFor = (layout: LayoutKind) => ({ ...createExampleDocument(), settings: { layout } })
function pointClose(actual: SpatialPoint | undefined, expected: SpatialPoint): void {
  expect(actual).toBeDefined()
  for (const [index, value] of expected.entries()) expect(actual?.[index]).toBeCloseTo(value)
}

describe('spatial structure geometry', () => {
  it.each(LAYOUT_KINDS)(
    'projects %s routes and decoration bounds without dropping logical connections',
    (kind) => {
      const document = documentFor(kind)
      const planar = layoutDocument(document)
      const spatial = layoutSpatialDocument(document)
      expect(spatial.edges.map((edge) => [edge.source, edge.target, edge.routing])).toEqual(
        planar.edges.map((edge) => [edge.source, edge.target, edge.routing]),
      )
      expect(spatial.decorations.map((decoration) => [decoration.id, decoration.kind])).toEqual(
        (planar.decorations ?? []).map((decoration) => [decoration.id, decoration.kind]),
      )
      for (const edge of spatial.edges) {
        expect([...edge.start, ...edge.end, ...numbers(edge.path)].every(Number.isFinite)).toBe(
          true,
        )
        if (edge.routing === 'hidden') expect(edge.path).toBe('')
        else {
          const points = loader
            .parse(
              `<svg xmlns="http://www.w3.org/2000/svg"><path d="${edge.path}" fill="none"/></svg>`,
            )
            .paths[0]?.subPaths[0]?.getPoints(12)
          expect(points?.[0]?.x).toBeCloseTo(edge.start[0])
          expect(points?.[0]?.y).toBeCloseTo(-edge.start[1])
          expect(points?.at(-1)?.x).toBeCloseTo(edge.end[0])
          expect(points?.at(-1)?.y).toBeCloseTo(-edge.end[1])
        }
      }
      expect(spatial.bounds).toEqual(spatialBounds(spatialFramingNodes(spatial, null)))
      expect(spatialBounds([...spatial.nodes, ...spatial.decorations])).toEqual(spatial.bounds)
      if (kind !== 'map')
        expect(new Set(spatial.nodes.map((node) => node.position[2]))).toEqual(new Set([0]))
    },
  )

  it.each(['org-down', 'org-up', 'tree-down', 'tree-up'] as const)(
    '%s routes through the correct top/bottom card anchors and perpendicular bends',
    (kind) => {
      const layout = layoutSpatialDocument(documentFor(kind))
      const byId = new Map(layout.nodes.map((node) => [node.id, node]))
      for (const edge of layout.edges) {
        const source = byId.get(edge.source),
          target = byId.get(edge.target)
        if (!source || !target) throw new Error('Missing card')
        const sign = kind.endsWith('up') ? 1 : -1
        pointClose(edge.start, [
          source.position[0],
          source.position[1] + (sign * source.height) / 2,
          0,
        ])
        pointClose(edge.end, [
          target.position[0],
          target.position[1] - (sign * target.height) / 2,
          0,
        ])
        expect(edge.path).toMatch(/ V .* H .* V /)
      }
    },
  )

  it.each(['brace-right', 'brace-left', 'fishbone', 'timeline', 'timeline-vertical'] as const)(
    '%s preserves exact planar bracket/spine curves on the owning component plane',
    (kind) => {
      const document = documentFor(kind)
      const planar = layoutDocument(document)
      const spatial = layoutSpatialDocument(document)
      for (const decoration of planar.decorations ?? []) {
        const projected = spatial.decorations.find((item) => item.id === decoration.id)
        if (!projected) throw new Error('Missing decoration')
        const original = numbers(layoutDecorationPath(decoration))
        const transformed = numbers(projected.path)
        expect(transformed).toHaveLength(original.length)
        for (const [index, value] of original.entries())
          expect(transformed[index]).toBeCloseTo(value / 100)
        expect(projected.position[2]).toBeLessThan(0)
      }
      if (kind === 'fishbone') {
        const ribs = spatial.edges.filter((edge) => edge.source === document.rootId)
        expect(ribs.every((edge) => edge.waypoints?.length === 2)).toBe(true)
        for (const rib of ribs) {
          expect(rib.start[1]).toBeCloseTo(0)
          expect(rib.start[0]).toBeGreaterThan(rib.end[0])
          expect(rib.end[1]).not.toBe(0)
          expect(rib.path).toMatch(/^M .* L /)
        }
      }
    },
  )

  it.each(['matrix', 'tree-table-right', 'tree-table-down'] as const)(
    '%s keeps cells behind contained editable cards and includes their full surfaces in camera bounds',
    (kind) => {
      const layout = layoutSpatialDocument(documentFor(kind))
      for (const cell of layout.decorations.filter((decoration) => decoration.kind === 'cell')) {
        const card = layout.nodes.find((node) => node.id === cell.topicId)
        if (!card) throw new Error('Missing card')
        expect(cell.position[2]).toBeLessThan(card.position[2] - 0.1)
        // Matrix's body background belongs to a header above it; regular cells contain their own card.
        if (cell.id.startsWith('cell-')) {
          expect(
            Math.abs(card.position[0] - cell.position[0]) + card.width / 2,
          ).toBeLessThanOrEqual(cell.width / 2 + 0.001)
          expect(
            Math.abs(card.position[1] - cell.position[1]) + card.height / 2,
          ).toBeLessThanOrEqual(cell.height / 2 + 0.001)
        }
        expect(cell.position[0] - cell.width / 2).toBeGreaterThanOrEqual(layout.bounds.min[0])
        expect(cell.position[1] - cell.height / 2).toBeGreaterThanOrEqual(layout.bounds.min[1])
      }
      expect(
        layout.edges.filter((edge) => edge.routing === 'hidden').every((edge) => !edge.path),
      ).toBe(true)
      if (kind === 'matrix') {
        const cell = layout.decorations.find((item) => item.kind === 'cell')
        const rule = layout.decorations.find((item) => item.kind === 'grid-line')
        expect(rule?.position[2]).toBeCloseTo((cell?.position[2] ?? 0) + 0.005)
      }
    },
  )

  it('keeps mixed and floating geometry on independent coherent planes, filters focus framing, and removes collapsed groups', () => {
    const document = applyCommand(documentFor('brace-right'), {
      type: 'batch',
      commands: [
        { type: 'setTopicStructure', topicId: 'vision', structure: 'tree-table-down' },
        { type: 'addFloatingTopic', id: 'floating', title: 'Floating', x: 3000, y: -900 },
        { type: 'setTopicStructure', topicId: 'floating', structure: 'fishbone' },
        { type: 'addTopic', parentId: 'floating', id: 'floating-child', title: 'Child' },
      ],
    })
    const layout = layoutSpatialDocument(document)
    const floating = layout.nodes.find((node) => node.id === 'floating')
    const child = layout.nodes.find((node) => node.id === 'floating-child')
    expect(floating?.position[2]).toBe(child?.position[2])
    const rib = layout.edges.find((edge) => edge.target === 'floating-child')
    expect(rib?.start[2]).toBe(floating?.position[2])
    const spine = layout.decorations.find((decoration) => decoration.id === 'spine-floating')
    expect(spine?.position[2]).toBeCloseTo((floating?.position[2] ?? 0) - 0.12)
    const focus = spatialSubtreeIds(document, 'vision')
    const framed = spatialFramingNodes(layout, focus)
    expect(framed.some((node) => node.id === 'cell-vision')).toBe(true)
    expect(framed.some((node) => node.id === 'brace-root' || node.id.startsWith('floating'))).toBe(
      false,
    )
    const collapsed = layoutSpatialDocument(
      applyCommand(document, { type: 'toggleCollapse', topicId: 'root' }),
    )
    expect(
      collapsed.decorations.some(
        (decoration) => decoration.id === 'brace-root' || decoration.id === 'cell-vision',
      ),
    ).toBe(false)
    expect(collapsed.decorations.some((decoration) => decoration.id === 'spine-floating')).toBe(
      true,
    )
  })

  it('projects straight styles without changing the document and preserves default map depth fanning', () => {
    const document = documentFor('map')
    const before = JSON.stringify(document)
    const plain = layoutSpatialDocument(document)
    const changed = applyCommand(document, {
      type: 'setTopicStyle',
      topicId: 'vision',
      style: { lineStyle: 'straight' },
    })
    const edge = layoutSpatialDocument(changed).edges.find((item) => item.target === 'vision')
    expect(edge?.path).toMatch(/^M .* L /)
    expect(plain.edges.find((item) => item.target === 'vision')?.path).toContain(' C ')
    expect(
      new Set(plain.nodes.filter((node) => node.depth === 1).map((node) => node.position[2])).size,
    ).toBe(4)
    expect(plain.decorations).toEqual([])
    expect(JSON.stringify(document)).toBe(before)
  })
})
