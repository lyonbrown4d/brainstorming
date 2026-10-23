import { BezierEdge, StraightEdge, type Edge, type EdgeProps } from '@xyflow/react'
import type { EdgePosition } from '@xyflow/system'
import { StructureEdge } from '@renderer/components/documents/StructureGeometry'

/** Shared drawing keeps dense fallbacks and live drag paths identical to the sparse renderer. */
export const StructuralEdgeDrawing = ({
  edge,
  geometry,
}: {
  edge: Edge
  geometry: EdgePosition
}) => {
  const props: Omit<EdgeProps, 'data' | 'type'> = {
    ...geometry,
    id: edge.id,
    source: edge.source,
    target: edge.target,
    selected: false,
    selectable: false,
    deletable: false,
    interactionWidth: 0,
    style: { ...edge.style, pointerEvents: 'none' },
  }
  return (
    <g
      {...edge.domAttributes}
      className={`react-flow__edge react-flow__edge-${edge.type ?? 'default'} ${edge.className ?? ''}`}
      style={{ pointerEvents: 'none' }}
      role={edge.ariaRole ?? 'img'}
      aria-roledescription="edge"
      aria-label={edge.ariaLabel ?? `Edge from ${edge.source} to ${edge.target}`}
      data-id={edge.id}
      data-testid={`rf__edge-${edge.id}`}
    >
      {edge.type === 'structure' ? (
        <StructureEdge
          {...props}
          type="structure"
          {...(edge.data
            ? { data: edge.data as NonNullable<Parameters<typeof StructureEdge>[0]['data']> }
            : {})}
        />
      ) : edge.type === 'straight' ? (
        <StraightEdge {...props} />
      ) : (
        <BezierEdge {...props} />
      )}
    </g>
  )
}
