import type { LayoutDirection, LayoutEdge, LayoutNode } from '@layout'
import { layoutEdgePath } from '@shared/layout-geometry'

export interface LiveEdgeGeometry {
  readonly edge: LayoutEdge
  readonly source: LayoutNode
  readonly target: LayoutNode
  readonly straight: boolean
}

/** React Flow supplies live handle endpoints; no document or whole-store subscription. */
export const liveLayoutEdgePath = (
  geometry: LiveEdgeGeometry,
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide: LayoutDirection,
  toSide: LayoutDirection,
): string => {
  const atHandle = (node: LayoutNode, point: { x: number; y: number }, side: LayoutDirection) => ({
    ...node,
    x: point.x - (side === 'left' ? 0 : side === 'right' ? node.width : node.width / 2),
    y: point.y - (side === 'up' ? 0 : side === 'down' ? node.height : node.height / 2),
  })
  const source = atHandle(geometry.source, from, fromSide)
  const target = atHandle(geometry.target, to, toSide)
  const sourceDelta = { x: source.x - geometry.source.x, y: source.y - geometry.source.y }
  const targetDelta = { x: target.x - geometry.target.x, y: target.y - geometry.target.y }
  const edge = geometry.edge.waypoints?.length
    ? {
        ...geometry.edge,
        waypoints: geometry.edge.waypoints.map((point, index, points) => {
          const t = points.length > 1 ? index / (points.length - 1) : 0
          return {
            x: point.x + sourceDelta.x * (1 - t) + targetDelta.x * t,
            y: point.y + sourceDelta.y * (1 - t) + targetDelta.y * t,
          }
        }),
      }
    : geometry.edge
  return layoutEdgePath({ ...edge, direction: fromSide }, source, target, geometry.straight)
}
