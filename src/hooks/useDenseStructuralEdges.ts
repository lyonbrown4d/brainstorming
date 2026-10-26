import { useCallback, useMemo, useState } from 'react'
import { useStore, type Edge, type ReactFlowState } from '@xyflow/react'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'
import { structuralEdgeTranslation } from '@renderer/lib/structuralEdgeTranslation'
import { createDenseStructuralEdgeCache } from '@renderer/lib/denseStructuralEdgePaths'

type DenseFrame = Pick<ReactFlowState, 'width' | 'height' | 'transform' | 'connectionMode'> & {
  readonly nodes: readonly ReturnType<ReactFlowState['nodeLookup']['get']>[]
}
const sameFrame = (before: DenseFrame, after: DenseFrame) =>
  before.width === after.width &&
  before.height === after.height &&
  before.connectionMode === after.connectionMode &&
  before.transform.every((value, index) => value === after.transform[index]) &&
  before.nodes.length === after.nodes.length &&
  before.nodes.every((node, index) => node === after.nodes[index])

/** Snapshot endpoint identities once per store update, rather than subscribing every edge. */
export const useDenseStructuralEdges = (edges: readonly Edge[], moving: ReadonlySet<string>) => {
  const token = useCanvasInteraction((state) => state.drag?.token)
  const ids = useMemo(
    () => [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))],
    [edges],
  )
  const frame = useStore(
    useCallback(
      (state: ReactFlowState): DenseFrame => ({
        nodes: ids.map((id) => state.nodeLookup.get(id)),
        width: state.width,
        height: state.height,
        transform: state.transform,
        connectionMode: state.connectionMode,
      }),
      [ids],
    ),
    sameFrame,
  )
  const rigid =
    token !== undefined &&
    ids.length > 1 &&
    ids.every((id, index) => {
      const node = frame.nodes[index]
      return (
        moving.has(id) &&
        node !== undefined &&
        Number.isFinite(node.internals.positionAbsolute.x) &&
        Number.isFinite(node.internals.positionAbsolute.y)
      )
    })
  const [held, setHeld] = useState<{
    token: symbol
    edges: readonly Edge[]
    mode: DenseFrame['connectionMode']
    nodes: DenseFrame['nodes']
  } | null>(null)
  const delta =
    rigid && held?.token === token && held.edges === edges && held.mode === frame.connectionMode
      ? structuralEdgeTranslation(held.nodes, frame.nodes)
      : null
  const baseline = delta
    ? held
    : rigid
      ? { token, edges, mode: frame.connectionMode, nodes: frame.nodes }
      : null
  if (held !== baseline) setHeld(baseline)
  const geometryNodes = baseline?.nodes ?? frame.nodes
  const dx = delta?.[0] ?? 0,
    dy = delta?.[1] ?? 0
  const transform = useMemo<ReactFlowState['transform']>(
    () => [
      frame.transform[0] + dx * frame.transform[2],
      frame.transform[1] + dy * frame.transform[2],
      frame.transform[2],
    ],
    [frame.transform, dx, dy],
  )
  const nodeLookup = useMemo(() => {
    const lookup: ReactFlowState['nodeLookup'] = new Map()
    for (const node of geometryNodes) if (node) lookup.set(node.id, node)
    return lookup
  }, [geometryNodes])
  const calculate = useMemo(() => createDenseStructuralEdgeCache(), [])
  const entries = useMemo(
    () =>
      calculate(
        {
          nodeLookup,
          width: frame.width,
          height: frame.height,
          connectionMode: frame.connectionMode,
          transform,
        },
        edges,
      ),
    [calculate, nodeLookup, frame.width, frame.height, frame.connectionMode, transform, edges],
  )
  return { entries, width: frame.width, height: frame.height, transform }
}
