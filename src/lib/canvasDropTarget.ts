import type { MindMapDocument, Side } from '@core'
import type { LayoutDirection } from '@layout/types'
import type { CanvasDrop, DropNode } from '@renderer/lib/canvasDrop'

interface Point {
  readonly x: number
  readonly y: number
}
const centerOf = (node: DropNode): Point => ({
  x: node.position.x + node.width / 2,
  y: node.position.y + node.height / 2,
})

/** Immutable topology and sibling axes belong to a gesture, not each pointer event. */
export const createTopicDropResolver = (
  document: MindMapDocument,
  nodes: readonly DropNode[],
  excluded: ReadonlySet<string>,
) => {
  const parents = new Map<string, string>()
  const indexes = new Map<string, number>()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const axes = new Map<string, boolean>()
  for (const topic of Object.values(document.topics)) {
    let index = 0
    for (const id of topic.children) {
      parents.set(id, topic.id)
      if (!excluded.has(id)) indexes.set(id, index++)
    }
  }
  const siblingAxis = (parentId: string, side: Side, direction: LayoutDirection): boolean => {
    const key = JSON.stringify([parentId, side, direction])
    const cached = axes.get(key)
    if (cached !== undefined) return cached
    let count = 0,
      minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const id of document.topics[parentId]?.children ?? []) {
      const node = byId.get(id)
      if (
        !node ||
        excluded.has(id) ||
        (parentId === document.rootId && document.topics[id]?.side !== side)
      )
        continue
      const center = centerOf(node)
      count += 1
      minX = Math.min(minX, center.x)
      maxX = Math.max(maxX, center.x)
      minY = Math.min(minY, center.y)
      maxY = Math.max(maxY, center.y)
    }
    const horizontal =
      count > 1 ? maxX - minX > maxY - minY : direction === 'up' || direction === 'down'
    axes.set(key, horizontal)
    return horizontal
  }
  return (candidates: readonly DropNode[], point: Point): CanvasDrop | undefined => {
    let closest: DropNode | undefined
    let distance = Infinity
    let bodyHit = false
    for (const node of candidates) {
      if (excluded.has(node.id) || !document.topics[node.id]) continue
      const center = centerOf(node)
      const dx = Math.abs(point.x - center.x)
      const dy = Math.abs(point.y - center.y)
      if (dx > node.width / 2 + 12 || dy > node.height / 2 + 12) continue
      const next = Math.hypot(dx, dy)
      const inside = dx <= node.width / 2 && dy <= node.height / 2
      if ((inside && !bodyHit) || (inside === bodyHit && next < distance)) {
        closest = node
        distance = next
        bodyHit = inside
      }
    }
    if (!closest) return undefined
    const center = centerOf(closest)
    const side = document.topics[closest.id]?.side ?? 'right'
    const parentId = parents.get(closest.id)
    if (parentId && !document.floatingIds?.includes(closest.id)) {
      const horizontal = siblingAxis(parentId, side, closest.direction)
      const offset = horizontal ? point.x - center.x : point.y - center.y
      const half = (horizontal ? closest.width : closest.height) / 2
      if (Math.abs(offset) > half * 0.65) {
        return {
          targetId: closest.id,
          parentId,
          index: (indexes.get(closest.id) ?? -1) + (offset > 0 ? 1 : 0),
          side,
          indicator: { axis: horizontal ? 'x' : 'y', edge: offset > 0 ? 'after' : 'before' },
        }
      }
    }
    // The halo assists sibling insertion only; child attachment requires the actual topic body.
    if (
      Math.abs(point.x - center.x) > closest.width / 2 ||
      Math.abs(point.y - center.y) > closest.height / 2
    )
      return undefined
    return {
      targetId: closest.id,
      parentId: closest.id,
      side: closest.id === document.rootId ? (point.x < center.x ? 'left' : 'right') : side,
    }
  }
}
