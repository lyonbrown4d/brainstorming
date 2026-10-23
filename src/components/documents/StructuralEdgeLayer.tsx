import { memo, useMemo } from 'react'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'
import { canvasDescendants } from '@renderer/lib/canvasGesture'
import { ViewportPortal, type Edge } from '@xyflow/react'
import { StructuralEdgeDrawing } from '@renderer/components/documents/StructuralEdgeDrawing'
import { DenseStructuralEdgeLayer } from '@renderer/components/documents/DenseStructuralEdgeLayer'
import { DENSE_STRUCTURAL_EDGE_THRESHOLD } from '@renderer/lib/denseStructuralEdgePaths'
import { useStructuralEdgeGeometry } from '@renderer/hooks/useStructuralEdgeGeometry'

const StructuralEdgePath = memo(({ edge }: { edge: Edge }) => {
  const geometry = useStructuralEdgeGeometry(edge)
  if (!geometry) return null
  return <StructuralEdgeDrawing edge={edge} geometry={geometry} />
})
StructuralEdgePath.displayName = 'StructuralEdgePath'

const EdgeSurface = ({ edges, cached }: { edges: readonly Edge[]; cached: boolean }) => (
  <svg
    className={`pointer-events-none absolute top-0 left-0 overflow-visible ${cached ? 'will-change-transform' : ''}`}
    style={{ zIndex: -1, pointerEvents: 'none' }}
    width={1}
    height={1}
    data-testid="structural-edge-layer"
  >
    {edges.map((edge) => (
      <StructuralEdgePath key={edge.id} edge={edge} />
    ))}
  </svg>
)

/** Keep unchanged paths cached while the active gesture redraws only its incident edges. */
export const StructuralEdgeLayer = ({ edges }: { edges: readonly Edge[] }) => {
  const document = useCanvasInteraction((state) => state.drag?.document)
  const roots = useCanvasInteraction((state) => state.drag?.roots)
  const moving = useMemo(
    () => new Set(document && roots ? canvasDescendants(document, roots) : []),
    [document, roots],
  )
  const layers = useMemo(() => {
    const fixed: Edge[] = [],
      active: Edge[] = []
    for (const edge of edges) {
      if (edge.type === 'relation' || edge.hidden) continue
      const layer = moving.has(edge.source) || moving.has(edge.target) ? active : fixed
      layer.push(edge)
    }
    return { fixed, active }
  }, [edges, moving])
  if (layers.fixed.length + layers.active.length >= DENSE_STRUCTURAL_EDGE_THRESHOLD) {
    return <DenseStructuralEdgeLayer edges={edges} moving={moving} />
  }
  return (
    <ViewportPortal>
      <EdgeSurface edges={layers.fixed} cached={Boolean(roots)} />
      {roots && <EdgeSurface edges={layers.active} cached={false} />}
    </ViewportPortal>
  )
}
