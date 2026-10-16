import { getParentId, type Command, type MindMapDocument, type Side } from '@core'
import type { TopicFlowNode } from '../components/TopicNode'

interface Point {
  readonly x: number
  readonly y: number
}
export interface CanvasDrop {
  readonly targetId: string
  readonly parentId: string
  readonly index?: number
  readonly side: Side
}
export function nodeCenter(node: TopicFlowNode): Point {
  return {
    x: node.position.x + Number(node.style?.width ?? node.width ?? 160) / 2,
    y: node.position.y + Number(node.style?.height ?? node.height ?? 48) / 2,
  }
}

/** Center drops attach; dropping at a sibling's outer edge inserts before or after it. */
export function findCanvasDrop(
  document: MindMapDocument,
  nodes: readonly TopicFlowNode[],
  excluded: ReadonlySet<string>,
  point: Point,
): CanvasDrop | undefined {
  let closest: TopicFlowNode | undefined
  let distance = Infinity
  for (const node of nodes) {
    if (excluded.has(node.id)) continue
    const center = nodeCenter(node)
    const dx = Math.abs(point.x - center.x)
    const dy = Math.abs(point.y - center.y)
    if (
      dx > Number(node.style?.width ?? 160) / 2 + 32 ||
      dy > Number(node.style?.height ?? 48) / 2 + 32
    )
      continue
    const next = Math.hypot(dx, dy)
    if (next < distance) {
      closest = node
      distance = next
    }
  }
  if (!closest) return undefined
  const center = nodeCenter(closest)
  const parentId = getParentId(document, closest.id)
  if (parentId && !document.floatingIds?.includes(closest.id)) {
    const siblings = nodes.filter(
      (node) =>
        document.topics[parentId]?.children.includes(node.id) &&
        !excluded.has(node.id) &&
        (parentId !== document.rootId || node.data.topic.side === closest.data.topic.side),
    )
    const xs = siblings.map((node) => nodeCenter(node).x)
    const ys = siblings.map((node) => nodeCenter(node).y)
    const horizontal =
      siblings.length > 1
        ? Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys)
        : closest.data.direction === 'up' || closest.data.direction === 'down'
    const offset = horizontal ? point.x - center.x : point.y - center.y
    const half =
      Number(horizontal ? (closest.style?.width ?? 160) : (closest.style?.height ?? 48)) / 2
    if (Math.abs(offset) > half * 0.65) {
      const remaining = document.topics[parentId]?.children.filter((id) => !excluded.has(id)) ?? []
      return {
        targetId: closest.id,
        parentId,
        index: remaining.indexOf(closest.id) + (offset > 0 ? 1 : 0),
        side: closest.data.topic.side,
      }
    }
  }
  return {
    targetId: closest.id,
    parentId: closest.id,
    side:
      closest.id === document.rootId
        ? point.x < center.x
          ? 'left'
          : 'right'
        : closest.data.topic.side,
  }
}

/** The whole gesture is one command, including a translation of several independent roots. */
export function canvasDropCommand(
  document: MindMapDocument,
  roots: readonly string[],
  origins: ReadonlyMap<string, Point>,
  delta: Point,
  drop: CanvasDrop | undefined,
): Command | undefined {
  if (drop)
    return {
      type: 'moveTopics',
      topicIds: roots,
      parentId: drop.parentId,
      side: drop.side,
      ...(drop.index === undefined ? {} : { index: drop.index }),
    }
  const commands: Command[] = roots.flatMap((topicId) => {
    const position = origins.get(topicId)
    return document.floatingIds?.includes(topicId) && position
      ? [
          {
            type: 'setFloatingPosition' as const,
            topicId,
            x: position.x + delta.x,
            y: position.y + delta.y,
          },
        ]
      : []
  })
  return commands.length ? { type: 'batch', commands } : undefined
}
