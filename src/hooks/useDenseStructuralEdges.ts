import { useCallback, useMemo } from 'react'
import { useStore, type Edge, type ReactFlowState } from '@xyflow/react'
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
export const useDenseStructuralEdges = (edges: readonly Edge[]) => {
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
  const calculate = useMemo(() => createDenseStructuralEdgeCache(), [])
  const entries = useMemo(() => {
    const nodeLookup: ReactFlowState['nodeLookup'] = new Map()
    frame.nodes.forEach((node) => {
      if (node) nodeLookup.set(node.id, node)
    })
    return calculate({ ...frame, nodeLookup }, edges)
  }, [calculate, frame, edges])
  return { entries, width: frame.width, height: frame.height, transform: frame.transform }
}
