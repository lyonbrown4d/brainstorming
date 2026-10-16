import {
  Graph,
  layout as dagreLayout,
  type GraphLabel,
  type NodeLabel,
  type EdgeLabel,
} from '@dagrejs/dagre'
import { layoutBounds, type LayoutComponent, type LayoutUnit, type LocalLayout } from './types'
import { requireUnit, treeLayout } from './tree-layout'

/** Each timeline/fishbone branch is a measured D3 tree, packed beside the spine in topic order. */
export function spineLayout(
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
  fishbone: boolean,
): LocalLayout {
  const root = requireUnit(units, component.rootId)
  const result: LocalLayout = {
    placements: [{ unit: root, x: 0, y: 0, direction: 'right' }],
    edges: [],
  }
  let cursor = root.width / 2 + 72
  for (const [index, id] of (component.children.get(root.id) ?? []).entries()) {
    const direction = fishbone && index % 2 === 0 ? 'up' : 'down'
    const branch = treeLayout(component, units, direction, id)
    const bounds = layoutBounds(branch.placements)
    const child = requireUnit(units, id)
    const offsetX = cursor - bounds.minX
    const offsetY = fishbone
      ? (root.height / 2 + 72 + child.height / 2) * (direction === 'up' ? -1 : 1)
      : 0
    for (const placement of branch.placements)
      result.placements.push({ ...placement, x: placement.x + offsetX, y: placement.y + offsetY })
    result.edges.push(
      { id: `edge-${id}`, source: root.id, target: id, direction: fishbone ? direction : 'right' },
      ...branch.edges,
    )
    cursor += bounds.maxX - bounds.minX + 72
  }
  return result
}

/** Dagre establishes row order for ordinary matrices; D3 bounds extreme/deep input costs. */
export function matrixLayout(
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
): LocalLayout {
  const result = treeLayout(component, units, 'right')
  if (component.ids.length <= 500) {
    const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>()
      .setGraph({ rankdir: 'LR', ranker: 'longest-path', align: 'UL', nodesep: 24, ranksep: 72 })
      .setDefaultEdgeLabel(() => ({}))
    for (const { unit } of result.placements)
      graph.setNode(unit.id, { width: unit.width, height: unit.height })
    for (const edge of result.edges) graph.setEdge(edge.source, edge.target, {})
    // Dagre's graph walks are recursive; a narrow deep tree uses the iterative D3 result.
    const maximumX = Math.max(...result.placements.map(({ x }) => x))
    if (maximumX < 20_000) {
      dagreLayout(graph)
      for (let index = 0; index < result.placements.length; index += 1) {
        const placement = result.placements[index]
        if (!placement) continue
        const node = graph.node(placement.unit.id)
        if (node.x !== undefined && node.y !== undefined)
          result.placements[index] = { ...placement, x: node.x, y: node.y }
      }
    }
  }
  const rows = [...new Set(result.placements.map(({ y }) => y))].sort((a, b) => a - b)
  const columns = [...new Set(result.placements.map(({ x }) => x))].sort((a, b) => a - b)
  const rowIndex = new Map(rows.map((value, index) => [value, index]))
  const columnIndex = new Map(columns.map((value, index) => [value, index]))
  let width = 0
  let height = 0
  for (const { unit } of result.placements) {
    width = Math.max(width, unit.width)
    height = Math.max(height, unit.height)
  }
  const root = result.placements.find(({ unit }) => unit.id === component.rootId)
  const rootColumn = columnIndex.get(root?.x ?? 0) ?? 0
  const rootRow = rowIndex.get(root?.y ?? 0) ?? 0
  return {
    edges: result.edges,
    placements: result.placements.map((placement) => ({
      ...placement,
      x: ((columnIndex.get(placement.x) ?? 0) - rootColumn) * (width + 72),
      y: ((rowIndex.get(placement.y) ?? 0) - rootRow) * (height + 24),
    })),
  }
}
