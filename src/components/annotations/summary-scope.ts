import type { LayoutNode } from '@layout'

export type SummaryScopeAxis = 'x' | 'y'

const center = (node: LayoutNode, axis: SummaryScopeAxis): number =>
  node[axis] + (axis === 'x' ? node.width : node.height) / 2

export const summaryScopeAxis = (nodes: readonly LayoutNode[]): SummaryScopeAxis => {
  if (nodes.length === 0) return 'y'
  const xs = nodes.map((node) => center(node, 'x'))
  const ys = nodes.map((node) => center(node, 'y'))
  return Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys) ? 'x' : 'y'
}

/** The pointer displacement starts at the original card center, avoiding a first-move jump. */
export const summaryScopeIndex = (
  nodes: readonly (LayoutNode | undefined)[],
  axis: SummaryScopeAxis,
  originCenter: number,
  pointerDelta: number,
  lower: number,
  upper: number,
  fallback: number,
): number => {
  const target = originCenter + pointerDelta
  let index = fallback
  let distance = Infinity
  for (let candidate = lower; candidate <= upper; candidate += 1) {
    const node = nodes[candidate]
    if (!node) continue
    const next = Math.abs(target - center(node, axis))
    if (next < distance) {
      distance = next
      index = candidate
    }
  }
  return index
}

export const summaryScopeCenter = center
