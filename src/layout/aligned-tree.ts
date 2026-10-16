import { hierarchy } from 'd3-hierarchy'
import { requireUnit, treeLayout } from './tree-layout'
import type { LayoutComponent, LayoutUnit, LocalLayout } from './types'

/** An aligned tree reserves each subtree's full breadth and aligns parent/first-child edges. */
export function alignedTreeLayout(
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
  direction: 'down' | 'up',
): LocalLayout {
  const root = requireUnit(units, component.rootId)
  const branch = hierarchy(root, (unit) =>
    (component.children.get(unit.id) ?? []).map((id) => requireUnit(units, id)),
  )
  const widths = new Map<string, number>()
  const heights: number[] = []
  branch.eachAfter((node) => {
    const children = node.children ?? []
    widths.set(
      node.data.id,
      Math.max(
        node.data.width,
        children.reduce((sum, child) => sum + (widths.get(child.data.id) ?? 0), 0) +
          Math.max(0, children.length - 1) * 24,
      ),
    )
    heights[node.depth] = Math.max(heights[node.depth] ?? 0, node.data.height)
  })
  const depths = [0]
  for (let depth = 1; depth < heights.length; depth += 1)
    depths[depth] =
      (depths[depth - 1] ?? 0) + (heights[depth - 1] ?? 0) / 2 + 64 + (heights[depth] ?? 0) / 2
  const starts = new Map<string, number>([[root.id, -root.width / 2]])
  const result: LocalLayout = { placements: [], edges: [] }
  branch.eachBefore((node) => {
    const start = starts.get(node.data.id) ?? 0
    result.placements.push({
      unit: node.data,
      x: start + node.data.width / 2,
      y: (depths[node.depth] ?? 0) * (direction === 'up' ? -1 : 1),
      direction,
    })
    let cursor = start
    for (const child of node.children ?? []) {
      starts.set(child.data.id, cursor)
      cursor += (widths.get(child.data.id) ?? 0) + 24
      result.edges.push({
        id: `edge-${child.data.id}`,
        source: node.data.id,
        target: child.data.id,
        direction,
        routing: 'orthogonal',
      })
    }
  })
  return result
}

/** Braces group direct siblings; logical parent edges remain available to spatial consumers. */
export function braceLayout(
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
  direction: 'right' | 'left',
): LocalLayout {
  const result = treeLayout(component, units, direction)
  const positions = new Map(result.placements.map((placement) => [placement.unit.id, placement]))
  const decorations: NonNullable<LocalLayout['decorations']> = []
  for (const parent of result.placements) {
    const children = (component.children.get(parent.unit.id) ?? []).flatMap((id) => {
      const child = positions.get(id)
      return child ? [child] : []
    })
    if (!children.length) continue
    let top = Infinity
    let bottom = -Infinity
    let inner = direction === 'right' ? Infinity : -Infinity
    for (const child of children) {
      top = Math.min(top, child.y - child.unit.height / 2)
      bottom = Math.max(bottom, child.y + child.unit.height / 2)
      inner =
        direction === 'right'
          ? Math.min(inner, child.x - child.unit.width / 2)
          : Math.max(inner, child.x + child.unit.width / 2)
    }
    decorations.push({
      id: `brace-${parent.unit.id}`,
      kind: 'brace',
      topicId: parent.unit.id,
      direction,
      x: direction === 'right' ? inner - 48 : inner + 16,
      y: top,
      width: 32,
      height: bottom - top,
    })
  }
  return {
    ...result,
    edges: result.edges.map((edge) => ({ ...edge, routing: 'hidden' })),
    decorations,
  }
}
