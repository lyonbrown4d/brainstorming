import { useCallback, useMemo } from 'react'
import { useStore, type Edge, type ReactFlowState } from '@xyflow/react'
import { shallow } from 'zustand/shallow'
import { canvasStructuralEdgeGeometry } from '@renderer/lib/canvasStructuralEdgeGeometry'

/** Endpoint identity avoids recalculating every static path on unrelated pointer frames. */
export const useStructuralEdgeGeometry = (edge: Edge) => {
  const frame = useStore(
    useCallback(
      (state: ReactFlowState) => ({
        source: state.nodeLookup.get(edge.source),
        target: state.nodeLookup.get(edge.target),
        width: state.width,
        height: state.height,
        transform: state.transform,
        connectionMode: state.connectionMode,
      }),
      [edge.source, edge.target],
    ),
    shallow,
  )
  return useMemo(() => {
    const nodeLookup: ReactFlowState['nodeLookup'] = new Map()
    if (frame.source) nodeLookup.set(edge.source, frame.source)
    if (frame.target) nodeLookup.set(edge.target, frame.target)
    return canvasStructuralEdgeGeometry({ ...frame, nodeLookup }, edge)
  }, [frame, edge])
}
