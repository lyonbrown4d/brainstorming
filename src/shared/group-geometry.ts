import type { LayoutNode } from '@layout'

export interface GroupBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
export const groupBounds = (
  nodes: readonly Pick<LayoutNode, 'x' | 'y' | 'width' | 'height'>[],
): GroupBounds | null => {
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
