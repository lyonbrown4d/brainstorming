import type { LayoutDecoration, LayoutEdge, LayoutNode } from '@layout/types'
import type { MindMapDocument } from '@core'

/** Structural view changes reframe the camera; typing and appearance changes do not. */
export const documentStructureKey = (document: MindMapDocument): string => {
  return `${document.settings?.layout ?? 'map'}:${Object.values(document.topics)
    .filter((topic) => topic.structure !== undefined)
    .map((topic) => `${topic.id}/${topic.structure}`)
    .join(',')}`
}

/** Shared by the editable canvas and full-sheet export, in layout coordinates. */
export const layoutEdgePath = (
  edge: LayoutEdge,
  source: LayoutNode,
  target: LayoutNode,
  straight = false,
): string => {
  if (edge.routing === 'hidden') return ''
  if (edge.waypoints?.length)
    return edge.waypoints.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
  const dx = target.x + target.width / 2 - source.x - source.width / 2
  const dy = target.y + target.height / 2 - source.y - source.height / 2
  const horizontal = edge.direction
    ? edge.direction === 'left' || edge.direction === 'right'
    : Math.abs(dx) >= Math.abs(dy)
  const left = edge.direction ? edge.direction === 'left' : dx < 0
  const up = edge.direction ? edge.direction === 'up' : dy < 0
  const x1 = source.x + (horizontal ? (left ? 0 : source.width) : source.width / 2)
  const y1 = source.y + (horizontal ? source.height / 2 : up ? 0 : source.height)
  const x2 = target.x + (horizontal ? (left ? target.width : 0) : target.width / 2)
  const y2 = target.y + (horizontal ? target.height / 2 : up ? target.height : 0)
  if (straight || edge.routing === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`
  const mx = (x1 + x2) / 2,
    my = (y1 + y2) / 2
  if (edge.routing === 'orthogonal')
    return horizontal
      ? `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`
      : `M ${x1} ${y1} V ${my} H ${x2} V ${y2}`
  return horizontal
    ? `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

export const layoutDecorationPath = (decoration: LayoutDecoration): string => {
  const { x, y, width, height, kind, direction } = decoration
  if (kind === 'spine' || kind === 'grid-line') return `M ${x} ${y} L ${x + width} ${y + height}`
  if (kind === 'cell') return ''
  const outer = direction === 'left' ? x + width : x
  const inner = direction === 'left' ? x : x + width
  const middle = (outer + inner) / 2
  const center = y + height / 2
  const bend = Math.min(height / 4, width / 2)
  return [
    `M ${inner} ${y}`,
    `Q ${middle} ${y} ${middle} ${y + bend}`,
    `L ${middle} ${center - bend}`,
    `Q ${middle} ${center} ${outer} ${center}`,
    `Q ${middle} ${center} ${middle} ${center + bend}`,
    `L ${middle} ${y + height - bend}`,
    `Q ${middle} ${y + height} ${inner} ${y + height}`,
  ].join(' ')
}
