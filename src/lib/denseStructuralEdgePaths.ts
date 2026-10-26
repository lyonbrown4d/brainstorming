import {
  getBezierPath,
  getStraightPath,
  type Edge,
  type InternalNode,
  type ReactFlowState,
} from '@xyflow/react'
import { getEdgePosition, isEdgeVisible, type EdgePosition } from '@xyflow/system'

export const DENSE_STRUCTURAL_EDGE_THRESHOLD = 250

type EdgeFrame = Pick<
  ReactFlowState,
  'nodeLookup' | 'width' | 'height' | 'transform' | 'connectionMode'
>
export interface DenseStructuralEdge {
  readonly edge: Edge
  readonly geometry: EdgePosition
  readonly path: string
}
interface CachedEdge extends DenseStructuralEdge {
  readonly source: InternalNode
  readonly target: InternalNode
  readonly mode: ReactFlowState['connectionMode']
}

/** One current-document cache; viewport motion only repeats official visibility checks. */
export const createDenseStructuralEdgeCache = () => {
  let cached = new Map<string, CachedEdge>()
  return (frame: EdgeFrame, edges: readonly Edge[]): readonly DenseStructuralEdge[] => {
    const next = new Map<string, CachedEdge>()
    const visible: DenseStructuralEdge[] = []
    for (const edge of edges) {
      const source = frame.nodeLookup.get(edge.source)
      const target = frame.nodeLookup.get(edge.target)
      if (!source || !target || edge.hidden || edge.type === 'relation') continue
      let entry = cached.get(edge.id)
      if (
        entry?.edge !== edge ||
        entry.source !== source ||
        entry.target !== target ||
        entry.mode !== frame.connectionMode
      ) {
        const geometry = getEdgePosition({
          id: edge.id,
          sourceNode: source,
          targetNode: target,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
          connectionMode: frame.connectionMode,
        })
        if (!geometry) continue
        const path =
          edge.type === 'straight' ? getStraightPath(geometry)[0] : getBezierPath(geometry)[0]
        entry = { edge, geometry, path, source, target, mode: frame.connectionMode }
      }
      next.set(edge.id, entry)
      if (
        frame.width &&
        frame.height &&
        isEdgeVisible({
          sourceNode: source,
          targetNode: target,
          width: frame.width,
          height: frame.height,
          transform: frame.transform,
        })
      )
        visible.push(entry)
    }
    cached = next
    return visible
  }
}

// These are the plain decorative projection fields. Unknown style/edge options use normal rendering.
const plainEdgeKeys = new Set([
  'id',
  'source',
  'target',
  'type',
  'sourceHandle',
  'targetHandle',
  'style',
  'selectable',
  'reconnectable',
  'interactionWidth',
  'direction',
])
export const denseStructuralEdgeStyleKey = (edge: Edge): string | null => {
  if (edge.type !== undefined && edge.type !== 'default' && edge.type !== 'straight') return null
  if (Object.keys(edge).some((key) => !plainEdgeKeys.has(key))) return null
  const style = edge.style
  if (!style || Object.keys(style).some((key) => key !== 'stroke' && key !== 'strokeWidth'))
    return null
  // CSS variables, alpha colors, filters and arbitrary classes cannot promise opaque compositing.
  if (typeof style.stroke !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(style.stroke))
    return null
  if (
    typeof style.strokeWidth !== 'number' ||
    !Number.isFinite(style.strokeWidth) ||
    style.strokeWidth <= 0
  )
    return null
  return `${style.stroke}:${style.strokeWidth}`
}

export type DenseStructuralEdgeRun =
  | { readonly kind: 'individual'; readonly entry: DenseStructuralEdge }
  | { readonly kind: 'batch'; readonly key: string; readonly entries: DenseStructuralEdge[] }

/** Only adjacent equal opaque styles merge, preserving paint order across all fallback edges. */
export const denseStructuralEdgeRuns = (
  entries: readonly DenseStructuralEdge[],
  moving: ReadonlySet<string>,
): readonly DenseStructuralEdgeRun[] => {
  const runs: DenseStructuralEdgeRun[] = []
  for (const entry of entries) {
    const key =
      moving.size <= 24 && (moving.has(entry.edge.source) || moving.has(entry.edge.target))
        ? null
        : denseStructuralEdgeStyleKey(entry.edge)
    const previous = runs.at(-1)
    if (key === null) {
      runs.push({ kind: 'individual', entry })
    } else if (previous?.kind === 'batch' && previous.key === key) {
      previous.entries.push(entry)
    } else {
      runs.push({ kind: 'batch', key, entries: [entry] })
    }
  }
  return runs
}
