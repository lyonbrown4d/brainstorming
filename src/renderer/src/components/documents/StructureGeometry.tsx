import { BaseEdge, ViewportPortal, type Edge, type EdgeProps } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import type { LayoutDecoration } from '@layout'
import { topicAppearance } from '@shared/appearance'
import { layoutDecorationPath } from '@shared/layout-geometry'

type StructureFlowEdge = Edge<{ path: string }, 'structure'>

export function StructureEdge({ id, data, style }: EdgeProps<StructureFlowEdge>) {
  return <BaseEdge id={id} path={data?.path ?? ''} style={style} interactionWidth={0} />
}

export function StructureGeometry({
  document,
  decorations,
}: {
  document: MindMapDocument
  decorations: readonly LayoutDecoration[]
}) {
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
          return decoration.kind === 'cell' ? (
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
              d={layoutDecorationPath(decoration)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
      </svg>
    </ViewportPortal>
  )
}
