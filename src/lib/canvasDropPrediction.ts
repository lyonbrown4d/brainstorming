import type { Rect, XYPosition } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import type { CanvasDrop, DropNode } from '@renderer/lib/canvasDrop'
import type { createTopicDropResolver } from '@renderer/lib/canvasDropTarget'

const center = (node: DropNode) => ({
  x: node.position.x + node.width / 2,
  y: node.position.y + node.height / 2,
})

/** A local gesture cache; the document and projected geometry stay immutable. */
export const createDropPrediction = (
  document: MindMapDocument,
  nodes: readonly DropNode[],
  excluded: ReadonlySet<string>,
  resolve: ReturnType<typeof createTopicDropResolver>,
  radius: number,
) => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const parents = new Map<string, string>()
  for (const topic of Object.values(document.topics))
    for (const id of topic.children) parents.set(id, topic.id)
  const roots = [...excluded].filter(
    (id) => document.topics[id] && !excluded.has(parents.get(id) ?? ''),
  )
  const unchanged = new Map<string, boolean>()
  const axes = new Map<string, 'x' | 'y' | null>()
  let previous: { drop: CanvasDrop; score: number } | undefined

  const isUnchanged = (drop: CanvasDrop) => {
    const key = JSON.stringify([drop.parentId, drop.index, drop.side])
    const cached = unchanged.get(key)
    if (cached !== undefined) return cached
    const parent = document.topics[drop.parentId]
    let same = roots.every(
      (id) =>
        parents.get(id) === drop.parentId &&
        (drop.index === undefined || document.topics[id]?.side === drop.side),
    )
    if (same && parent && drop.index !== undefined) {
      const remaining = parent.children.filter((id) => !excluded.has(id))
      remaining.splice(drop.index, 0, ...roots)
      same = parent.children.every((id, index) => remaining[index] === id)
    }
    unchanged.set(key, same)
    return same
  }
  const siblingAxis = (node: DropNode): 'x' | 'y' | null => {
    if (axes.has(node.id)) return axes.get(node.id) ?? null
    const c = center(node)
    const probeX = resolve([node], { x: node.position.x - 4, y: c.y })
    const probeY = resolve([node], { x: c.x, y: node.position.y - 4 })
    const axis = probeX?.indicator?.axis ?? probeY?.indicator?.axis ?? null
    axes.set(node.id, axis)
    return axis
  }
  const candidate = (
    node: DropNode,
    point: XYPosition,
    bounds: Rect,
    reach: number,
  ): { drop: CanvasDrop; score: number } | undefined => {
    const c = center(node)
    const moving = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const gapX = Math.max(
      node.position.x - bounds.x - bounds.width,
      bounds.x - node.position.x - node.width,
      0,
    )
    const gapY = Math.max(
      node.position.y - bounds.y - bounds.height,
      bounds.y - node.position.y - node.height,
      0,
    )
    const distance = Math.hypot(gapX, gapY)
    if (distance > reach) return undefined
    const parent = byId.get(parents.get(node.id) ?? '')
    const from = parent ? center(parent) : undefined
    const dx = from ? c.x - from.x : node.direction === 'left' ? -1 : 1
    const dy = from
      ? c.y - from.y
      : node.direction === 'up'
        ? -1
        : node.direction === 'down'
          ? 1
          : 0
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const outward = horizontal ? (moving.x - c.x) * Math.sign(dx) : (moving.y - c.y) * Math.sign(dy)
    const cross = Math.abs(horizontal ? moving.y - c.y : moving.x - c.x)
    const half = (horizontal ? node.width : node.height) / 2
    const crossHalf = (horizontal ? node.height : node.width) / 2
    const side = document.topics[node.id]?.side ?? 'right'
    const child: CanvasDrop = {
      targetId: node.id,
      parentId: node.id,
      side: node.id === document.rootId ? (moving.x < c.x ? 'left' : 'right') : side,
      predicted: true,
    }
    // Approach along the branch's visible outgoing direction, including a rotated 3D camera.
    if (
      (node.id === document.rootId || outward >= half * 0.65) &&
      (node.id === document.rootId || cross <= crossHalf + reach * 0.5) &&
      !isUnchanged(child)
    )
      return { drop: child, score: distance + cross * 0.1 }

    const axis = siblingAxis(node)
    if (!axis) return undefined
    const offset = axis === 'x' ? moving.x - c.x : moving.y - c.y
    const perpendicular = Math.abs(axis === 'x' ? moving.y - c.y : moving.x - c.x)
    const perpendicularHalf =
      (axis === 'x' ? node.height + bounds.height : node.width + bounds.width) / 2
    if (
      Math.abs(offset) <= (axis === 'x' ? node.width : node.height) * 0.325 ||
      perpendicular > perpendicularHalf + reach * 0.35
    )
      return undefined
    const probe =
      axis === 'x'
        ? { x: c.x + Math.sign(offset) * (node.width / 2 + 4), y: c.y }
        : { x: c.x, y: c.y + Math.sign(offset) * (node.height / 2 + 4) }
    const drop = resolve([node], probe)
    if (!drop?.indicator || isUnchanged(drop)) return undefined
    // The cursor only breaks ties; off-centre grabs still use the visible moving rectangle.
    return {
      drop: { ...drop, predicted: true },
      score: distance + Math.hypot(point.x - c.x, point.y - c.y) * 0.01,
    }
  }
  return (candidates: readonly DropNode[], point: XYPosition, bounds?: Rect) => {
    const moving = bounds ?? { ...point, width: 0, height: 0 }
    let best: ReturnType<typeof candidate>
    let retained: ReturnType<typeof candidate>
    for (const node of candidates) {
      const next = candidate(node, point, moving, radius)
      if (
        next &&
        (!best ||
          next.score < best.score ||
          (next.score === best.score &&
            (node.zIndex ?? 0) > (byId.get(best.drop.targetId)?.zIndex ?? 0)))
      )
        best = next
      if (node.id === previous?.drop.targetId) {
        const held = candidate(node, point, moving, radius * 1.25)
        if (
          held?.drop.parentId === previous.drop.parentId &&
          held.drop.index === previous.drop.index
        )
          retained = held
      }
    }
    // A small exit band prevents flicker between adjacent candidates without delaying a frame.
    previous = retained && (!best || retained.score <= best.score + radius / 6) ? retained : best
    return previous?.drop
  }
}
