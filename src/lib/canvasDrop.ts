import { type Command, type MindMapDocument, type Side } from '@core'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import type { LayoutDirection } from '@layout/types'
import { createTopicDropResolver } from '@renderer/lib/canvasDropTarget'

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
  readonly zIndex?: number
}
export interface CanvasDrop {
  readonly targetId: string
  readonly parentId: string
  readonly index?: number
  readonly side: Side
  readonly predicted?: true
  readonly indicator?: { readonly axis: 'x' | 'y'; readonly edge: 'before' | 'after' }
}
export const nodeCenter = (
  node: Pick<TopicFlowNode, 'position' | 'style' | 'width' | 'height'>,
): Point => {
  return {
    x: node.position.x + Number(node.style?.width ?? node.width ?? 160) / 2,
    y: node.position.y + Number(node.style?.height ?? node.height ?? 48) / 2,
  }
}

/** Center drops attach; dropping at a sibling's outer edge inserts before or after it. */
export const findCanvasDrop = (
  document: MindMapDocument,
  nodes: readonly CanvasFlowNode[],
  excluded: ReadonlySet<string>,
  point: Point,
): CanvasDrop | undefined => {
  return findTopicDrop(
    document,
    nodes
      .filter((node) => node.type !== 'ink')
      .map((node) => ({
        id: node.id,
        position: node.position,
        width: Number(node.style?.width ?? node.width ?? 160),
        height: Number(node.style?.height ?? node.height ?? 48),
        direction: node.data.direction ?? 'right',
        zIndex: node.zIndex ?? 0,
      })),
    excluded,
    point,
  )
}

/** View-neutral targeting in a common projected coordinate system. */
export const findTopicDrop = (
  document: MindMapDocument,
  nodes: readonly DropNode[],
  excluded: ReadonlySet<string>,
  point: Point,
): CanvasDrop | undefined => {
  return createTopicDropResolver(document, nodes, excluded)(nodes, point)
}

/** The whole gesture is one command, including a translation of several independent roots. */
export const canvasDropCommand = (
  document: MindMapDocument,
  roots: readonly string[],
  origins: ReadonlyMap<string, Point>,
  delta: Point & { z?: number },
  drop: CanvasDrop | undefined,
): Command | undefined => {
  if (drop) {
    const resetOffsets: Command[] = roots.flatMap((topicId) => {
      const style = document.topics[topicId]?.style
      if (!style?.offsetX && !style?.offsetY) return []
      const appearance = { ...style }
      delete appearance.offsetX
      delete appearance.offsetY
      return [{ type: 'setTopicStyle', topicId, style: appearance }]
    })
    const move: Command = {
      type: 'moveTopics',
      topicIds: roots,
      parentId: drop.parentId,
      side: drop.side,
      ...(drop.index === undefined ? {} : { index: drop.index }),
    }
    return resetOffsets.length ? { type: 'batch', commands: [move, ...resetOffsets] } : move
  }
  if (!delta.x && !delta.y && !delta.z) return undefined
  const commands: Command[] = roots.flatMap<Command>((topicId) => {
    const position = origins.get(topicId)
    return document.floatingIds?.includes(topicId) && position
      ? [
          {
            type: 'setFloatingPosition' as const,
            topicId,
            x:
              (document.floatingPositions?.[topicId]?.x ??
                position.x - (document.topics[topicId]?.style?.offsetX ?? 0)) + delta.x,
            y:
              (document.floatingPositions?.[topicId]?.y ??
                position.y - (document.topics[topicId]?.style?.offsetY ?? 0)) + delta.y,
          },
          ...(delta.z
            ? [
                {
                  type: 'setTopicStyle' as const,
                  topicId,
                  style: {
                    ...document.topics[topicId]?.style,
                    spatialDepth: (document.topics[topicId]?.style?.spatialDepth ?? 0) + delta.z,
                  },
                },
              ]
            : []),
        ]
      : position
        ? [
            {
              type: 'setTopicStyle' as const,
              topicId,
              style: {
                ...document.topics[topicId]?.style,
                offsetX: (document.topics[topicId]?.style?.offsetX ?? 0) + delta.x,
                offsetY: (document.topics[topicId]?.style?.offsetY ?? 0) + delta.y,
                ...(delta.z
                  ? { spatialDepth: (document.topics[topicId]?.style?.spatialDepth ?? 0) + delta.z }
                  : {}),
              },
            },
          ]
        : []
  })
  return commands.length ? { type: 'batch', commands } : undefined
}
