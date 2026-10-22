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
  let next: CanvasFlowNode[] | undefined
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (!node) continue
    const start = session.origins.get(node.id)
    if (!session.excluded.has(node.id) || !start) continue
    const ratio = spatialPerspectiveScale(session.view, depths.get(node.id) ?? 0) / anchorScale
    const x = start.x + dx * ratio,
      y = start.y + dy * ratio
    if (node.position.x === x && node.position.y === y) continue
    next ??= nodes.slice()
    next[index] = { ...node, position: { x, y } }
  }
  return next ?? nodes
}
