import Flatbush from 'flatbush'
import type { MindMapDocument } from '@core'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { DropNode } from '@renderer/lib/canvasDrop'
import { createTopicDropResolver } from '@renderer/lib/canvasDropTarget'

/** A static R-tree is rebuilt only at gesture start and released at stop/cancel. */
export const createCanvasDropFinder = (
  document: MindMapDocument,
  projected: readonly CanvasFlowNode[],
  excluded: ReadonlySet<string>,
) => {
  const nodes: DropNode[] = projected.flatMap((node) =>
    node.type === 'ink'
      ? []
      : [
          {
            id: node.id,
            position: node.position,
            width: Number(node.style?.width ?? node.width ?? 160),
            height: Number(node.style?.height ?? node.height ?? 48),
            direction: node.data.direction ?? 'right',
          },
        ],
  )
  const resolve = createTopicDropResolver(document, nodes, excluded)
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
  return (point: { readonly x: number; readonly y: number }) => {
    if (!index || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined
    // Equal-distance overlaps keep the same projection order as the linear reference.
    const candidates = index
      .search(point.x, point.y, point.x, point.y)
      .sort((a, b) => a - b)
      .flatMap((id) => (targets[id] ? [targets[id]] : []))
    return resolve(candidates, point)
  }
}
