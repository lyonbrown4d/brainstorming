import { layoutDecorationPath, layoutEdgePath } from '@shared/layout-geometry'
import type {
  LayoutDecoration,
  LayoutDirection,
  LayoutEdge,
  LayoutNode,
  MindMapLayout,
} from '@layout/types'
import type { SpatialLayout, SpatialNode, SpatialPoint } from '@layout/spatial'

export interface SpatialEdge extends Omit<LayoutEdge, 'waypoints'> {
  /** SVG in world units, with SVG's downward Y axis. Three.js projects it with Y reversed. */
  readonly path: string
  readonly waypoints?: readonly SpatialPoint[]
  readonly start: SpatialPoint
  readonly end: SpatialPoint
}

export interface SpatialDecoration {
  readonly id: string
  readonly kind: LayoutDecoration['kind']
  readonly topicId: string
  readonly direction?: LayoutDirection
  readonly position: SpatialPoint
  readonly width: number
  readonly height: number
  /** Brace/spine SVG in world units, on the decoration's plane. Cells use a plane surface. */
  readonly path: string
}

const planarCard = (node: SpatialNode): LayoutNode => {
  return {
    id: node.id,
    x: node.position[0] - node.width / 2,
    y: -node.position[1] - node.height / 2,
    width: node.width,
    height: node.height,
    side: 'right',
  }
}

const anchor = (node: SpatialNode, direction: LayoutDirection, source: boolean): SpatialPoint => {
  const sign = (direction === 'left' || direction === 'up' ? -1 : 1) * (source ? 1 : -1)
  return direction === 'left' || direction === 'right'
    ? [node.position[0] + (sign * node.width) / 2, node.position[1], node.position[2]]
    : [node.position[0], node.position[1] - (sign * node.height) / 2, node.position[2]]
}

/** Project existing planar routes/decorations, retaining their semantic geometry and logical edges. */
export const projectSpatialGeometry = (
  planar: MindMapLayout,
  nodes: readonly SpatialNode[],
  rootId: string,
  straightIds: ReadonlySet<string>,
): { edges: SpatialEdge[]; decorations: SpatialDecoration[] } => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const planarById = new Map(planar.nodes.map((node) => [node.id, node]))
  const offset = (id: string): { x: number; y: number } => {
    const view = byId.get(id)
    const card = planarById.get(id)
    return view && card
      ? {
          x: view.position[0] - (card.x + card.width / 2) / 100,
          y: -view.position[1] - (card.y + card.height / 2) / 100,
        }
      : { x: 0, y: 0 }
  }
  const edges = planar.edges.flatMap((edge): SpatialEdge[] => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return []
    const direction = edge.direction ?? (target.position[0] < source.position[0] ? 'left' : 'right')
    const shift = offset(edge.source)
    const waypoints = edge.waypoints?.map((point) => ({
      x: point.x / 100 + shift.x,
      y: point.y / 100 + shift.y,
    }))
    const first = waypoints?.[0]
    const last = waypoints?.at(-1)
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(edge.routing ? { routing: edge.routing } : {}),
        ...(waypoints
          ? {
              waypoints: waypoints.map((point, index): SpatialPoint => [
                point.x,
                -point.y,
                source.position[2] +
                  ((target.position[2] - source.position[2]) * index) /
                    Math.max(1, waypoints.length - 1),
              ]),
            }
          : {}),
        direction,
        path: layoutEdgePath(
          { ...edge, direction, ...(waypoints ? { waypoints } : {}) },
          planarCard(source),
          planarCard(target),
          straightIds.has(target.id),
        ),
        start: first ? [first.x, -first.y, source.position[2]] : anchor(source, direction, true),
        end: last ? [last.x, -last.y, target.position[2]] : anchor(target, direction, false),
      },
    ]
  })
  const decorations = (planar.decorations ?? []).flatMap((decoration): SpatialDecoration[] => {
    const topicId = decoration.topicId ?? rootId
    const owner = byId.get(topicId)
    if (!owner) return []
    const shift = offset(topicId)
    const projected: LayoutDecoration = {
      ...decoration,
      x: decoration.x / 100 + shift.x,
      y: decoration.y / 100 + shift.y,
      width: decoration.width / 100,
      height: decoration.height / 100,
    }
    return [
      {
        id: decoration.id,
        topicId,
        kind: decoration.kind,
        ...(decoration.direction ? { direction: decoration.direction } : {}),
        position: [
          projected.x + projected.width / 2,
          -projected.y - projected.height / 2,
          // Grid rules share the cell border plane, preventing doubled lines in perspective.
          owner.position[2] -
            (decoration.kind === 'cell' ? 0.2 : decoration.kind === 'grid-line' ? 0.195 : 0.12),
        ],
        width: projected.width,
        height: projected.height,
        // Preserve the helper's pixel-sized brace bends before scaling all coordinates to world units.
        path: layoutDecorationPath({
          ...decoration,
          x: decoration.x + shift.x * 100,
          y: decoration.y + shift.y * 100,
        }).replace(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi, (number) => String(Number(number) / 100)),
      },
    ]
  })
  return { edges, decorations }
}

/** Camera-only bounds proxies keep full spanning cells/braces in frame, including during branch focus. */
export const spatialFramingNodes = (
  layout: SpatialLayout,
  focusIds: ReadonlySet<string> | null,
): SpatialNode[] => {
  return [
    ...layout.nodes.filter((node) => focusIds === null || focusIds.has(node.id)),
    ...layout.decorations
      .filter((decoration) => focusIds === null || focusIds.has(decoration.topicId))
      .map((decoration) => ({
        id: decoration.id,
        branchId: decoration.topicId,
        depth: 0,
        position: decoration.position,
        width: decoration.width,
        height: decoration.height,
      })),
  ]
}
