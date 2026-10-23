import { getEdgePosition, isEdgeVisible, type EdgePosition } from '@xyflow/system'
import type { Edge, ReactFlowState } from '@xyflow/react'

/** Match React Flow's visible-edge and live-handle geometry without a per-edge SVG root. */
export const canvasStructuralEdgeGeometry = (
  state: Pick<ReactFlowState, 'nodeLookup' | 'width' | 'height' | 'transform' | 'connectionMode'>,
  edge: Edge,
): EdgePosition | null => {
  const sourceNode = state.nodeLookup.get(edge.source)
  const targetNode = state.nodeLookup.get(edge.target)
  if (
    !sourceNode ||
    !targetNode ||
    !state.width ||
    !state.height ||
    !isEdgeVisible({
      sourceNode,
      targetNode,
      width: state.width,
      height: state.height,
      transform: state.transform,
    })
  )
    return null
  return getEdgePosition({
    id: edge.id,
    sourceNode,
    targetNode,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    connectionMode: state.connectionMode,
  })
}
