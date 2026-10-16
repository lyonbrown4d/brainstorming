import { MarkerType, type Edge } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import type { LayoutNode } from '@layout'

export interface GroupBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
export function groupBounds(
  nodes: readonly Pick<LayoutNode, 'x' | 'y' | 'width' | 'height'>[],
): GroupBounds | null {
  if (!nodes.length) return null
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity
  for (const node of nodes) {
    left = Math.min(left, node.x)
    top = Math.min(top, node.y)
    right = Math.max(right, node.x + node.width)
    bottom = Math.max(bottom, node.y + node.height)
  }
  return { x: left - 16, y: top - 26, width: right - left + 32, height: bottom - top + 42 }
}
export function relationEdges(document: MindMapDocument, visibleIds: ReadonlySet<string>): Edge[] {
  return (document.relations ?? []).flatMap((relation) => {
    if (!visibleIds.has(relation.from) || !visibleIds.has(relation.to)) return []
    const color = relation.color ?? '#8b79d9'
    const arrow = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
    return [
      {
        id: `relation-${relation.id}`,
        source: relation.from,
        target: relation.to,
        label: relation.title,
        type: 'relation',
        selectable: true,
        reconnectable: true,
        style: {
          stroke: color,
          strokeWidth: relation.width ?? 2,
          strokeDasharray: relation.dashed ? '6 4' : undefined,
        },
        ...(relation.arrow === 'both' ? { markerStart: arrow } : {}),
        ...(relation.arrow === 'none' ? {} : { markerEnd: arrow }),
        labelStyle: { fill: color, fontSize: 12 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.94 },
      },
    ]
  })
}
