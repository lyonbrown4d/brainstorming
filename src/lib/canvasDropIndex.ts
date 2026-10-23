import Flatbush from 'flatbush'
import type { Rect } from '@xyflow/react'
import { createDropPrediction } from '@renderer/lib/canvasDropPrediction'
import type { MindMapDocument } from '@core'
import { canvasNodeSize, type CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { DropNode } from '@renderer/lib/canvasDrop'
import { createTopicDropResolver } from '@renderer/lib/canvasDropTarget'

/** A static R-tree is rebuilt only at gesture start and released at stop/cancel. */
export const createCanvasDropFinder = (
  document: MindMapDocument,
  projected: readonly CanvasFlowNode[],
  excluded: ReadonlySet<string>,
  proximity = 0,
) => {
  const nodes: DropNode[] = projected.flatMap((node) =>
    node.type === 'ink'
      ? []
      : [
          {
            id: node.id,
            position: node.position,
            ...canvasNodeSize(node),
            direction: node.data.direction ?? 'right',
            zIndex: node.zIndex ?? 0,
          },
        ],
  )
  const resolve = createTopicDropResolver(document, nodes, excluded)
  const predict = createDropPrediction(document, nodes, excluded, resolve, proximity)
  const targets = nodes.filter((node) => !excluded.has(node.id) && document.topics[node.id])
  const index = targets.length ? new Flatbush(targets.length) : null
  for (const node of targets)
    index?.add(
      node.position.x - 12,
      node.position.y - 12,
      node.position.x + node.width + 12,
      node.position.y + node.height + 12,
    )
  index?.finish()
  return (point: { readonly x: number; readonly y: number }, bounds?: Rect) => {
    if (!index || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined
    if (bounds && ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite))
      return undefined
    const padding = proximity * 1.25
    const left = bounds ? Math.min(point.x, bounds.x) : point.x
    const top = bounds ? Math.min(point.y, bounds.y) : point.y
    const right = bounds ? Math.max(point.x, bounds.x + bounds.width) : point.x
    const bottom = bounds ? Math.max(point.y, bounds.y + bounds.height) : point.y
    // Equal-distance overlaps keep projection order; frontmost bodies win in 3D.
    const candidates = index
      .search(left - padding, top - padding, right + padding, bottom + padding)
      .sort((a, b) => a - b)
      .flatMap((id) => (targets[id] ? [targets[id]] : []))
    const exact = resolve(candidates, point)
    if (exact || !proximity) {
      predict([], point)
      return exact
    }
    return predict(candidates, point, bounds)
  }
}
