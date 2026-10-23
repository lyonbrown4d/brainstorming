import Flatbush from 'flatbush'
import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import type { DropNode } from '@renderer/lib/canvasDrop'
import { createTopicDropResolver } from '@renderer/lib/canvasDropTarget'
import { createDropPrediction } from '@renderer/lib/canvasDropPrediction'
import type { SpatialSceneRect } from '@renderer/lib/independentSpatialRuntime'
import type {
  SpatialMarquee,
  SpatialPointerPoint,
} from '@renderer/lib/independentSpatialGestureGeometry'

/** Screen geometry and topology are captured once while the camera is frozen. */
export const createIndependentSpatialDropFinder = (
  document: MindMapDocument,
  layout: MindMapLayout,
  rectangles: readonly SpatialSceneRect[],
  excluded: ReadonlySet<string>,
) => {
  const directions = new Map(layout.nodes.map((node) => [node.id, node.direction ?? 'right']))
  const nodes: DropNode[] = rectangles
    .filter((rect) => rect.kind === 'topic')
    .map((rect) => ({
      id: rect.id,
      position: { x: rect.x, y: rect.y },
      width: rect.width,
      height: rect.height,
      direction: directions.get(rect.id) ?? 'right',
      zIndex: -rect.depth,
    }))
  const resolve = createTopicDropResolver(document, nodes, excluded)
  const predict = createDropPrediction(document, nodes, excluded, resolve, 48)
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
  return (point: SpatialPointerPoint, bounds: SpatialMarquee) => {
    if (
      !index ||
      ![point.x, point.y, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    )
      return undefined
    const candidates = index
      .search(
        Math.min(point.x, bounds.x) - 60,
        Math.min(point.y, bounds.y) - 60,
        Math.max(point.x, bounds.x + bounds.width) + 60,
        Math.max(point.y, bounds.y + bounds.height) + 60,
      )
      .sort((a, b) => a - b)
      .flatMap((id) => (targets[id] ? [targets[id]] : []))
    const exact = resolve(candidates, point)
    if (exact) {
      predict([], point)
      return exact
    }
    return predict(candidates, point, bounds)
  }
}
