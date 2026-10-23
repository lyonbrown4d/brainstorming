import type { NodeChange } from '@xyflow/react'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { DragSession } from '@renderer/lib/canvasGestureSession'

/** Every 2D descendant shares the anchor's canvas displacement. */
export const previewCanvasDrag = (
  nodes: CanvasFlowNode[],
  session: Pick<DragSession, 'excluded' | 'origins'>,
  dx: number,
  dy: number,
): CanvasFlowNode[] => {
  let next: CanvasFlowNode[] | undefined
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (!node || !session.excluded.has(node.id)) continue
    const origin = session.origins.get(node.id)
    if (!origin) continue
    const x = origin.x + dx,
      y = origin.y + dy
    if (node.position.x === x && node.position.y === y) continue
    next ??= nodes.slice()
    next[index] = { ...node, position: { x, y } }
  }
  return next ?? nodes
}

/** Apply the latest anchor once, atomically with React Flow's pointer-owned position. */
export const canvasDragPreview = (
  changes: readonly NodeChange<CanvasFlowNode>[],
  session: DragSession | null,
): ((nodes: CanvasFlowNode[]) => CanvasFlowNode[]) | undefined => {
  if (!session) return undefined
  const anchor = changes.find(
    (change) => change.type === 'position' && change.id === session.anchorId,
  )
  const origin = session.origins.get(session.anchorId)
  if (anchor?.type !== 'position' || !anchor.position || !origin) return undefined
  const dx = anchor.position.x - origin.x,
    dy = anchor.position.y - origin.y
  return (nodes) => previewCanvasDrag(nodes, session, dx, dy)
}
