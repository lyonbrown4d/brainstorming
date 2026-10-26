import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import type { Edge } from '@xyflow/react'
import { StructuralEdgeDrawing } from '@renderer/components/documents/StructuralEdgeDrawing'
import { useDenseStructuralEdges } from '@renderer/hooks/useDenseStructuralEdges'
import {
  denseStructuralEdgeRuns,
  denseStructuralEdgeStyleKey,
} from '@renderer/lib/denseStructuralEdgePaths'

const GpuEdges = lazy(() => import('@renderer/components/documents/DenseEdgeGpuLayer'))

export const DenseStructuralEdgeLayer = ({
  edges,
  moving,
}: {
  edges: readonly Edge[]
  moving: ReadonlySet<string>
}) => {
  const structural = useMemo(
    () => edges.filter((edge) => edge.type !== 'relation' && !edge.hidden),
    [edges],
  )
  const { entries, width, height, transform } = useDenseStructuralEdges(structural, moving)
  const eligible = useMemo(
    () =>
      import.meta.env.VITE_DENSE_EDGE_GPU === '1' &&
      structural.every((edge) => denseStructuralEdgeStyleKey(edge) !== null),
    [structural],
  )
  const [readyEdges, setReadyEdges] = useState<readonly Edge[] | null>(null)
  const rendering = moving.size > 0
  const ready = eligible && readyEdges === structural && rendering
  const publish = useCallback(
    (value: boolean) => {
      setReadyEdges(value ? structural : null)
    },
    [structural],
  )
  const runs = useMemo(
    () => (ready ? [] : denseStructuralEdgeRuns(entries, moving)),
    [ready, entries, moving],
  )
  const [x, y, zoom] = transform
  return (
    <>
      {!ready && (
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
                  data-structural-edge-ids={JSON.stringify(
                    run.entries.map((entry) => entry.edge.id),
                  )}
                  data-structural-edge-count={run.entries.length}
                />
              )
            })}
          </g>
        </svg>
      )}
      {eligible && (
        <ErrorBoundary
          fallback={null}
          onError={() => {
            publish(false)
          }}
          resetKeys={[edges]}
        >
          <Suspense fallback={null}>
            <GpuEdges
              entries={entries}
              width={width}
              height={height}
              transform={transform}
              onReady={publish}
              active={ready}
              rendering={rendering}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}
