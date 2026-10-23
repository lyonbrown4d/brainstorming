import { useMemo } from 'react'
import type { Edge } from '@xyflow/react'
import { StructuralEdgeDrawing } from '@renderer/components/documents/StructuralEdgeDrawing'
import { useDenseStructuralEdges } from '@renderer/hooks/useDenseStructuralEdges'
import { denseStructuralEdgeRuns } from '@renderer/lib/denseStructuralEdgePaths'

export const DenseStructuralEdgeLayer = ({
  edges,
  moving,
}: {
  edges: readonly Edge[]
  moving: ReadonlySet<string>
}) => {
  const { entries, width, height, transform } = useDenseStructuralEdges(edges)
  const runs = useMemo(() => denseStructuralEdgeRuns(entries, moving), [entries, moving])
  const [x, y, zoom] = transform
  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 overflow-hidden [contain:strict]"
      style={{ zIndex: 1, pointerEvents: 'none' }}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="structural-edge-layer"
      data-structural-edge-renderer="dense"
    >
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        {runs.map((run) => {
          if (run.kind === 'individual')
            return (
              <StructuralEdgeDrawing
                key={run.entry.edge.id}
                edge={run.entry.edge}
                geometry={run.entry.geometry}
              />
            )
          const first = run.entries[0]
          if (!first) return null
          return (
            <path
              key={first.edge.id}
              className="react-flow__edge-path"
              d={run.entries.map((entry) => entry.path).join(' ')}
              style={first.edge.style}
              fill="none"
              aria-hidden="true"
              data-structural-edge-ids={JSON.stringify(run.entries.map((entry) => entry.edge.id))}
              data-structural-edge-count={run.entries.length}
            />
          )
        })}
      </g>
    </svg>
  )
}
