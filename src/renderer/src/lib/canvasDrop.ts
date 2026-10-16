import { getParentId, type Command, type MindMapDocument, type Side } from '@core'
import type { TopicFlowNode } from '../components/TopicNode'
import type { LayoutDirection } from '../../../layout/types'

interface Point {
  readonly x: number
  readonly y: number
}
export interface DropNode {
  readonly id: string
  readonly position: Point
  readonly width: number
  readonly height: number
  readonly direction: LayoutDirection
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
  return findTopicDrop(
    document,
    nodes.map((node) => ({
      id: node.id,
      position: node.position,
      width: Number(node.style?.width ?? node.width ?? 160),
      height: Number(node.style?.height ?? node.height ?? 48),
      direction: node.data.direction ?? 'right',
    })),
    excluded,
    point,
  )
}

/** View-neutral targeting in a common projected coordinate system. */
export function findTopicDrop(
  document: MindMapDocument,
  nodes: readonly DropNode[],
  excluded: ReadonlySet<string>,
  point: Point,
): CanvasDrop | undefined {
  const centerOf = (node: DropNode): Point => ({
    x: node.position.x + node.width / 2,
    y: node.position.y + node.height / 2,
  })
  let closest: DropNode | undefined
  let distance = Infinity
  for (const node of nodes) {
    if (excluded.has(node.id) || !document.topics[node.id]) continue
    const center = centerOf(node)
    const dx = Math.abs(point.x - center.x)
    const dy = Math.abs(point.y - center.y)
    if (dx > node.width / 2 + 32 || dy > node.height / 2 + 32) continue
    const next = Math.hypot(dx, dy)
    if (next < distance) {
      closest = node
      distance = next
    }
  }
  if (!closest) return undefined
  const center = centerOf(closest)
  const side = document.topics[closest.id]?.side ?? 'right'
  const parentId = getParentId(document, closest.id)
  if (parentId && !document.floatingIds?.includes(closest.id)) {
    const siblings = nodes.filter(
      (node) =>
        document.topics[parentId]?.children.includes(node.id) &&
        !excluded.has(node.id) &&
        (parentId !== document.rootId || document.topics[node.id]?.side === side),
    )
    const xs = siblings.map((node) => centerOf(node).x)
    const ys = siblings.map((node) => centerOf(node).y)
    const horizontal =
      siblings.length > 1
        ? Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys)
        : closest.direction === 'up' || closest.direction === 'down'
    const offset = horizontal ? point.x - center.x : point.y - center.y
    const half = (horizontal ? closest.width : closest.height) / 2
    if (Math.abs(offset) > half * 0.65) {
      const remaining = document.topics[parentId]?.children.filter((id) => !excluded.has(id)) ?? []
      return {
        targetId: closest.id,
        parentId,
        index: remaining.indexOf(closest.id) + (offset > 0 ? 1 : 0),
        side,
      }
    }
  }
  return {
    targetId: closest.id,
    parentId: closest.id,
    side: closest.id === document.rootId ? (point.x < center.x ? 'left' : 'right') : side,
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
