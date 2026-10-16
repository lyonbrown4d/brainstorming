import { hierarchy, partition } from 'd3-hierarchy'
import { requireUnit } from './tree-layout'
import type { LayoutComponent, LayoutUnit, LocalLayout } from './types'

/** D3's icicle partition supplies hierarchical spanning cells with measured editable cards. */
export function tableLayout(
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
  direction: 'right' | 'down',
): LocalLayout {
  const vertical = direction === 'down'
  const root = requireUnit(units, component.rootId)
  const branch = hierarchy(root, (unit) =>
    (component.children.get(unit.id) ?? []).map((id) => requireUnit(units, id)),
  ).sum((unit) => (component.children.get(unit.id)?.length ? 0 : 1))
  const divided = partition<LayoutUnit>().size([1, 1])(branch)
  const depths: number[] = []
  let breadth = 0
  divided.eachBefore((node) => {
    const unit = node.data
    breadth = Math.max(breadth, ((vertical ? unit.width : unit.height) + 32) / (node.x1 - node.x0))
    depths[node.depth] = Math.max(
      depths[node.depth] ?? 0,
      (vertical ? unit.height : unit.width) + 32,
    )
  })
  const starts = [-(depths[0] ?? 0) / 2]
  for (let depth = 1; depth < depths.length; depth += 1)
    starts[depth] = (starts[depth - 1] ?? 0) + (depths[depth - 1] ?? 0)
  const result: LocalLayout = { placements: [], edges: [], decorations: [] }
  divided.eachBefore((node) => {
    const crossStart = (node.x0 - 0.5) * breadth
    const crossSize = (node.x1 - node.x0) * breadth
    const depthStart = starts[node.depth] ?? 0
    const depthSize = depths[node.depth] ?? 0
    result.placements.push({
      unit: node.data,
      x: vertical ? crossStart + crossSize / 2 : depthStart + depthSize / 2,
      y: vertical ? depthStart + depthSize / 2 : crossStart + crossSize / 2,
      direction,
    })
    result.decorations?.push({
      id: `cell-${node.data.id}`,
      kind: 'cell',
      topicId: node.data.id,
      direction,
      x: vertical ? crossStart : depthStart,
      y: vertical ? depthStart : crossStart,
      width: vertical ? crossSize : depthSize,
      height: vertical ? depthSize : crossSize,
    })
    if (node.parent)
      result.edges.push({
        id: `edge-${node.data.id}`,
        source: node.parent.data.id,
        target: node.data.id,
        direction,
        routing: 'hidden',
      })
  })
  return result
}
