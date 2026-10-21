import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import type { SpatialView } from '@renderer/state/spatialView'

export interface SpatialOffset {
  readonly x: number
  readonly y: number
  readonly z: number
}
export type SpatialDepths = ReadonlyMap<string, number> | Readonly<Record<string, number>>
const isDepthMap = (depths: SpatialDepths): depths is ReadonlyMap<string, number> =>
  depths instanceof Map

interface PositionedNode {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
}

const ZERO_OFFSET: SpatialOffset = Object.freeze({ x: 0, y: 0, z: 0 })
const readDepth = (depths: SpatialDepths, id: string): number | undefined =>
  isDepthMap(depths) ? depths.get(id) : depths[id]
const offsetAtDepth = (z: number, slope: { x: number; y: number }): SpatialOffset => ({
  x: z * slope.x,
  y: z * slope.y,
  z,
})

/** Oblique view keeps the canvas axes and billboard topic dimensions unchanged. */
export const spatialProjectionSlope = (view: SpatialView): { x: number; y: number } => ({
  x: Math.sin(view.yaw) * Math.cos(view.pitch),
  y: -Math.sin(view.pitch),
})

/** One traversal also handles malformed or disconnected trees without recursion. */
export const spatialTopicOffsets = (
  document: MindMapDocument,
  view: SpatialView,
): ReadonlyMap<string, SpatialOffset> => {
  const offsets = new Map<string, SpatialOffset>()
  if (view.mode === '2d') return offsets
  const slope = spatialProjectionSlope(view)
  const floating = new Set(document.floatingIds ?? [])
  const visited = new Set<string>()
  const roots = [document.rootId, ...floating, ...Object.keys(document.topics)]
  for (const rootId of roots) {
    if (visited.has(rootId) || !document.topics[rootId]) continue
    const stack = [{ id: rootId, depth: 0, branch: 0, inherited: 0 }]
    while (stack.length) {
      const entry = stack.pop()
      if (!entry || visited.has(entry.id)) continue
      const topic = document.topics[entry.id]
      if (!topic) continue
      visited.add(entry.id)
      const local = topic.style?.spatialDepth ?? 0
      const z =
        entry.depth * view.spacing +
        entry.branch +
        entry.inherited +
        (Number.isFinite(local) ? local : 0)
      offsets.set(entry.id, offsetAtDepth(z, slope))
      const children = topic.children.filter((id) => !floating.has(id) && !!document.topics[id])
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index]
        if (!child) continue
        const branch =
          entry.depth === 0
            ? (index - (children.length - 1) / 2) * view.spacing * 0.7
            : entry.branch
        stack.push({
          id: child,
          depth: entry.depth + 1,
          branch,
          inherited: entry.inherited + (Number.isFinite(local) ? local : 0),
        })
      }
    }
  }
  return offsets
}

export const spatialTopicOffset = (
  document: MindMapDocument,
  topicId: string,
  view: SpatialView,
  depths?: SpatialDepths,
): SpatialOffset => {
  if (view.mode === '2d') return ZERO_OFFSET
  if (depths) {
    const z = readDepth(depths, topicId)
    return z === undefined ? ZERO_OFFSET : offsetAtDepth(z, spatialProjectionSlope(view))
  }
  return spatialTopicOffsets(document, view).get(topicId) ?? ZERO_OFFSET
}

const offsetsForView = (
  document: MindMapDocument,
  view: SpatialView,
  depths?: SpatialDepths,
): ReadonlyMap<string, SpatialOffset> => {
  if (!depths) return spatialTopicOffsets(document, view)
  const slope = spatialProjectionSlope(view)
  const entries = isDepthMap(depths) ? depths.entries() : Object.entries(depths)
  return new Map([...entries].map(([id, z]) => [id, offsetAtDepth(z, slope)]))
}

/** Pointer delta stays projected; commands receive native origins. */
export const captureSpatialOrigins = (
  document: MindMapDocument,
  view: SpatialView,
  nodes: readonly PositionedNode[],
  depths?: SpatialDepths,
): {
  origins: Map<string, { x: number; y: number }>
  nativeOrigins: Map<string, { x: number; y: number }>
} => {
  const offsets = offsetsForView(document, view, depths)
  const origins = new Map(nodes.map((node) => [node.id, { ...node.position }]))
  const nativeOrigins = new Map(
    [...origins].map(([id, position]) => {
      const offset = offsets.get(id)
      return [id, { x: position.x - (offset?.x ?? 0), y: position.y - (offset?.y ?? 0) }] as const
    }),
  )
  return { origins, nativeOrigins }
}

/** Move absolute geometry by its topic depth; ink stays on the canvas plane. */
export const projectSpatialLayout = (
  document: MindMapDocument,
  layout: MindMapLayout,
  view: SpatialView,
  depths?: SpatialDepths,
): MindMapLayout => {
  if (view.mode === '2d') return layout
  const offsets = offsetsForView(document, view, depths)
  const rootOffset = offsets.get(document.rootId) ?? ZERO_OFFSET
  return {
    nodes: layout.nodes.map((node) => {
      const offset = offsets.get(node.id) ?? ZERO_OFFSET
      return { ...node, x: node.x + offset.x, y: node.y + offset.y }
    }),
    edges: layout.edges.map((edge) => {
      if (!edge.waypoints?.length) return edge
      const source = offsets.get(edge.source) ?? ZERO_OFFSET
      const target = offsets.get(edge.target) ?? ZERO_OFFSET
      const last = edge.waypoints.length - 1
      return {
        ...edge,
        waypoints: edge.waypoints.map((point, index) => {
          const t = last ? index / last : 0
          return {
            x: point.x + source.x + (target.x - source.x) * t,
            y: point.y + source.y + (target.y - source.y) * t,
          }
        }),
      }
    }),
    ...(layout.decorations
      ? {
          decorations: layout.decorations.map((decoration) => {
            const offset = decoration.topicId
              ? (offsets.get(decoration.topicId) ?? rootOffset)
              : rootOffset
            return { ...decoration, x: decoration.x + offset.x, y: decoration.y + offset.y }
          }),
        }
      : {}),
  }
}
