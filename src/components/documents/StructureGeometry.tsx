import { liveSketchEdgePath, type SketchEdgeGeometry } from '@shared/sketch-edges'
import { visualPath } from '@shared/sketch'
import { BaseEdge, ViewportPortal, type Edge, type EdgeProps } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import type { LayoutDecoration } from '@layout'
import { topicAppearance } from '@shared/appearance'
import { layoutDecorationPath } from '@shared/layout-geometry'

type StructureFlowEdge = Edge<{ path: string; liveSketch?: SketchEdgeGeometry }, 'structure'>

export const StructureEdge = (props: EdgeProps<StructureFlowEdge>) => {
  const { id, data, style, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } =
    props
  const direction = { left: 'left', right: 'right', top: 'up', bottom: 'down' } as const
  const path = data?.liveSketch
    ? liveSketchEdgePath(
        data.liveSketch,
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
        direction[sourcePosition],
        direction[targetPosition],
      )
    : (data?.path ?? '')
  return <BaseEdge id={id} path={path} style={style} interactionWidth={0} />
}

export const StructureGeometry = ({
  document,
  decorations,
}: {
  document: MindMapDocument
  decorations: readonly LayoutDecoration[]
}) => {
  return (
    <ViewportPortal>
      <svg
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
        aria-hidden="true"
        data-testid="structure-geometry"
      >
        {decorations.map((decoration) => {
          const appearance = topicAppearance(document, decoration.topicId ?? document.rootId)
          const common = {
            stroke: appearance.stroke,
            strokeWidth:
              decoration.kind === 'cell' || decoration.kind === 'grid-line'
                ? 1
                : appearance.lineWidth,
            ...(decoration.kind === 'grid-line' ? { strokeOpacity: 0.4 } : {}),
            'data-structure-kind': decoration.kind,
          }
          return decoration.kind === 'cell' && document.settings?.visualStyle !== 'sketch' ? (
            <rect
              key={decoration.id}
              {...common}
              x={decoration.x}
              y={decoration.y}
              width={decoration.width}
              height={decoration.height}
              fill={appearance.stroke}
              fillOpacity={0.035}
              strokeOpacity={0.4}
            />
          ) : (
            <path
              key={decoration.id}
              {...common}
              d={visualPath(
                layoutDecorationPath(decoration),
                document.settings?.visualStyle,
                `decoration:${decoration.id}`,
              )}
              fill={decoration.kind === 'cell' ? appearance.stroke : 'none'}
              fillOpacity={decoration.kind === 'cell' ? 0.035 : undefined}
              strokeOpacity={decoration.kind === 'cell' ? 0.4 : common.strokeOpacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
      </svg>
    </ViewportPortal>
  )
}
