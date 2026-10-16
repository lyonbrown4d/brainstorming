import { hierarchy, tree } from 'd3-hierarchy'
import type { LayoutComponent, LayoutDirection, LayoutUnit, LocalLayout } from './types'

export function requireUnit(units: ReadonlyMap<string, LayoutUnit>, id: string): LayoutUnit {
  const unit = units.get(id)
  if (!unit) throw new Error('布局主题不存在')
  return unit
}

/** D3 handles tidy-tree ordering and separation; this adapter supplies measured component boxes. */
export function treeLayout(
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
  direction: LayoutDirection,
  rootId = component.rootId,
  firstChildren?: readonly string[],
): LocalLayout {
  const vertical = direction === 'down' || direction === 'up'
  const root = requireUnit(units, rootId)
  const branch = hierarchy(root, (unit) =>
    (unit.id === rootId && firstChildren !== undefined
      ? firstChildren
      : (component.children.get(unit.id) ?? [])
    ).map((id) => requireUnit(units, id)),
  )
  const breadth = (unit: LayoutUnit): number => (vertical ? unit.width : unit.height)
  const depthSize = (unit: LayoutUnit): number => (vertical ? unit.height : unit.width)
  const positioned = tree<LayoutUnit>()
    .nodeSize([1, 1])
    .separation((a, b) => (breadth(a.data) + breadth(b.data)) / 2 + 24)(branch)
  const maximums: number[] = []
  positioned.eachBefore((node) => {
    maximums[node.depth] = Math.max(maximums[node.depth] ?? 0, depthSize(node.data))
  })
  const offsets = [0]
  for (let depth = 1; depth < maximums.length; depth += 1)
    offsets[depth] =
      (offsets[depth - 1] ?? 0) + (maximums[depth - 1] ?? 0) / 2 + 72 + (maximums[depth] ?? 0) / 2
  const sign = direction === 'left' || direction === 'up' ? -1 : 1
  const result: LocalLayout = { placements: [], edges: [] }
  positioned.eachBefore((node) => {
    const offset = (offsets[node.depth] ?? 0) * sign
    result.placements.push({
      unit: node.data,
      x: vertical ? node.x : offset,
      y: vertical ? offset : node.x,
      direction,
    })
    if (node.parent !== null)
      result.edges.push({
        id: `edge-${node.data.id}`,
        source: node.parent.data.id,
        target: node.data.id,
        direction,
      })
  })
  return result
}

export function mapLayout(
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
): LocalLayout {
  const children = component.children.get(component.rootId) ?? []
  const result: LocalLayout = { placements: [], edges: [] }
  for (const direction of ['left', 'right'] as const) {
    const ids = children.filter((id) => requireUnit(units, id).topic.side === direction)
    const layout = treeLayout(component, units, direction, component.rootId, ids)
    result.placements.push(
      ...layout.placements.filter(
        ({ unit }) => unit.id !== component.rootId || direction === 'right',
      ),
    )
    result.edges.push(...layout.edges)
  }
  return result
}
