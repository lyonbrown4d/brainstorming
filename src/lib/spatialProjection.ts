import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import { inkGeometry } from '@shared/ink-geometry'
import {
  projectSpatialPoint,
  spatialDepthVisible,
  spatialPerspectiveScale,
} from '@renderer/lib/spatialCamera'
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
  readonly type?: string
  readonly data?: unknown
}

const ZERO_OFFSET: SpatialOffset = Object.freeze({ x: 0, y: 0, z: 0 })
const readDepth = (depths: SpatialDepths, id: string): number | undefined =>
  isDepthMap(depths) ? depths.get(id) : depths[id]
const offsetAtDepth = (z: number): SpatialOffset => ({ x: 0, y: 0, z })

/** One traversal also handles malformed or disconnected trees without recursion. */
export const spatialTopicOffsets = (
  document: MindMapDocument,
  view: SpatialView,
): ReadonlyMap<string, SpatialOffset> => {
  const offsets = new Map<string, SpatialOffset>()
  if (view.mode === '2d') return offsets
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
      offsets.set(entry.id, offsetAtDepth(z))
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
    return z === undefined ? ZERO_OFFSET : offsetAtDepth(z)
  }
  return spatialTopicOffsets(document, view).get(topicId) ?? ZERO_OFFSET
}

const offsetsForView = (
  document: MindMapDocument,
  view: SpatialView,
  depths?: SpatialDepths,
): ReadonlyMap<string, SpatialOffset> => {
  if (!depths) return spatialTopicOffsets(document, view)
  const entries = isDepthMap(depths) ? depths.entries() : Object.entries(depths)
  return new Map([...entries].map(([id, z]) => [id, offsetAtDepth(z)]))
}

/** Native origins come from canonical geometry because a rotated plane cannot be inverted from x/y alone. */
export const captureSpatialOrigins = (
  document: MindMapDocument,
  view: SpatialView,
  nodes: readonly PositionedNode[],
  _depths?: SpatialDepths,
  nativeLayout?: MindMapLayout,
): {
  origins: Map<string, { x: number; y: number }>
  nativeOrigins: Map<string, { x: number; y: number }>
} => {
  const origins = new Map(nodes.map((node) => [node.id, { ...node.position }]))
  if (view.mode === '2d') return { origins, nativeOrigins: new Map(origins) }
  if (!nativeLayout) throw new Error('3D drag requires the canonical native layout')
  const topicOrigins = new Map(
    nativeLayout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  )
  const inkOrigins = new Map(
    (document.drawings ?? []).map((stroke) => {
      const { x, y } = inkGeometry(stroke).bounds
      return [stroke.id, { x, y }] as const
    }),
  )
  const nativeOrigins = new Map(
    nodes.map((node) => {
      let position: { x: number; y: number } | undefined
      if (node.type === 'ink') {
        const data = node.data
        if (typeof data !== 'object' || data === null || !('stroke' in data))
          throw new Error(`Missing stroke data for ${node.id}`)
        const stroke = data.stroke
        if (
          typeof stroke !== 'object' ||
          stroke === null ||
          !('id' in stroke) ||
          typeof stroke.id !== 'string'
        )
          throw new Error(`Missing stroke ID for ${node.id}`)
        position = inkOrigins.get(stroke.id)
      } else position = topicOrigins.get(node.id)
      if (!position) throw new Error(`Missing native origin for ${node.id}`)
      return [node.id, position] as const
    }),
  )
  return { origins, nativeOrigins }
}

/** Project camera-facing billboards around their canonical centers. */
export const projectSpatialLayout = (
  document: MindMapDocument,
  layout: MindMapLayout,
  view: SpatialView,
  depths?: SpatialDepths,
): MindMapLayout => {
  if (view.mode === '2d') return layout
  const offsets = offsetsForView(document, view, depths)
  const rootDepth = offsets.get(document.rootId)?.z ?? 0
  const nodes = layout.nodes.flatMap((node) => {
    const center = projectSpatialPoint(
      {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
        z: offsets.get(node.id)?.z ?? 0,
      },
      view,
    )
    if (!spatialDepthVisible(view, center.z)) return []
    const cameraScale = spatialPerspectiveScale(view, center.z)
    const width = node.width * cameraScale
    const height = node.height * cameraScale
    return [
      {
        ...node,
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        cameraDepth: center.z,
        cameraScale,
        worldWidth: node.width,
        worldHeight: node.height,
      },
    ]
  })
  const visibleIds = new Set(nodes.map((node) => node.id))
  return {
    nodes,
    edges: layout.edges
      .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .map((edge) => {
        if (!edge.waypoints?.length) return edge
        const source = offsets.get(edge.source)?.z ?? 0
        const target = offsets.get(edge.target)?.z ?? 0
        const last = edge.waypoints.length - 1
        return {
          ...edge,
          waypoints: edge.waypoints.map((point, index) => {
            const z = source + (target - source) * (last ? index / last : 0)
            const projected = projectSpatialPoint({ ...point, z }, view)
            return { x: projected.x, y: projected.y }
          }),
        }
      }),
    ...(layout.decorations
      ? {
          decorations: layout.decorations.flatMap((decoration) => {
            const z = decoration.topicId
              ? (offsets.get(decoration.topicId)?.z ?? rootDepth)
              : rootDepth
            const center = projectSpatialPoint(
              {
                x: decoration.x + decoration.width / 2,
                y: decoration.y + decoration.height / 2,
                z,
              },
              view,
            )
            if (!spatialDepthVisible(view, center.z)) return []
            const scale = spatialPerspectiveScale(view, center.z)
            const width = decoration.width * scale
            const height = decoration.height * scale
            return [
              {
                ...decoration,
                x: center.x - width / 2,
                y: center.y - height / 2,
                width,
                height,
              },
            ]
          }),
        }
      : {}),
  }
}
