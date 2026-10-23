import type { NodeChange } from '@xyflow/react'
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

/** Capture the newest anchor once; all descendants share the same frame's world displacement. */
export const canvasPerspectivePreview = (
  changes: readonly NodeChange<CanvasFlowNode>[],
  session: DragSession | null,
  depths: ReadonlyMap<string, number>,
): ((nodes: CanvasFlowNode[]) => CanvasFlowNode[]) | undefined => {
  if (!session) return undefined
  const anchor = changes.find(
    (change) => change.type === 'position' && change.id === session.anchorId,
  )
  const origin = session.origins.get(session.anchorId)
  if (anchor?.type !== 'position' || !anchor.position || !origin) return undefined
  const dx = anchor.position.x - origin.x
  const dy = anchor.position.y - origin.y
  return (nodes) => previewPerspectiveDrag(nodes, session, depths, dx, dy)
}
