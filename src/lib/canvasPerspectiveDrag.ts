import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { DragSession } from '@renderer/lib/canvasGestureSession'
import { spatialPerspectiveScale } from '@renderer/lib/spatialCamera'

/** One world translation gives a different screen translation at each depth. */
export const previewPerspectiveDrag = (
  nodes: CanvasFlowNode[],
  session: Pick<DragSession, 'excluded' | 'origins' | 'view' | 'anchorId'>,
  depths: ReadonlyMap<string, number>,
  dx: number,
  dy: number,
): CanvasFlowNode[] => {
  const anchorScale = spatialPerspectiveScale(session.view, depths.get(session.anchorId) ?? 0)
  return nodes.map((node) => {
    const start = session.origins.get(node.id)
    if (!session.excluded.has(node.id) || !start) return node
    const ratio = spatialPerspectiveScale(session.view, depths.get(node.id) ?? 0) / anchorScale
    return { ...node, position: { x: start.x + dx * ratio, y: start.y + dy * ratio } }
  })
}
