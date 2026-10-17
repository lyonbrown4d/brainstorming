import {
  layoutBounds,
  type LayoutComponent,
  type LayoutUnit,
  type LocalLayout,
} from '@layout/types'
import { requireUnit, treeLayout } from '@layout/tree-layout'

/** Measured D3 branches are packed along a real spine; ribs attach at ordered spine points. */
export const spineLayout = (
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
  kind: 'fishbone' | 'timeline' | 'timeline-vertical',
): LocalLayout => {
  const root = requireUnit(units, component.rootId)
  const vertical = kind === 'timeline-vertical'
  const fishbone = kind === 'fishbone'
  const result: LocalLayout = {
    placements: [{ unit: root, x: 0, y: 0, direction: vertical ? 'down' : 'right' }],
    edges: [],
    decorations: [],
  }
  let cursor = (vertical ? root.height : root.width) / 2 + 72
  let end = cursor
  for (const [index, id] of (component.children.get(root.id) ?? []).entries()) {
    const direction = vertical ? 'right' : fishbone && index % 2 === 0 ? 'up' : 'down'
    const branch = treeLayout(component, units, direction, id)
    const bounds = layoutBounds(branch.placements)
    const child = requireUnit(units, id)
    const offsetX = vertical ? 0 : cursor - bounds.minX
    const offsetY = vertical
      ? cursor - bounds.minY
      : fishbone
        ? (root.height / 2 + 88 + child.height / 2) * (direction === 'up' ? -1 : 1)
        : 0
    for (const placement of branch.placements)
      result.placements.push({ ...placement, x: placement.x + offsetX, y: placement.y + offsetY })
    result.edges.push(
      {
        id: `edge-${id}`,
        source: root.id,
        target: id,
        direction: vertical ? 'down' : fishbone ? direction : 'right',
        routing: fishbone ? 'straight' : 'hidden',
        ...(fishbone
          ? {
              waypoints: [
                { x: offsetX + child.width / 2 + 56, y: 0 },
                {
                  x: offsetX,
                  y: offsetY + (direction === 'up' ? child.height / 2 : -child.height / 2),
                },
              ],
            }
          : {}),
      },
      ...branch.edges.map((edge) => ({ ...edge, routing: 'orthogonal' as const })),
    )
    end = vertical ? offsetY + child.height / 2 : offsetX + child.width / 2 + (fishbone ? 56 : 0)
    cursor += (vertical ? bounds.maxY - bounds.minY : bounds.maxX - bounds.minX) + 96
  }
  if (result.placements.length > 1)
    result.decorations?.push({
      id: `spine-${root.id}`,
      kind: 'spine',
      topicId: root.id,
      direction: vertical ? 'down' : 'right',
      x: vertical ? 0 : root.width / 2,
      y: vertical ? root.height / 2 : 0,
      width: vertical ? 0 : end - root.width / 2,
      height: vertical ? end - root.height / 2 : 0,
    })
  return result
}
