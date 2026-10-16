import type { LayoutKind, Side, Topic } from '@core'

export type LayoutDirection = 'left' | 'right' | 'up' | 'down'
export interface LayoutNode {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly side: Side
  readonly direction?: LayoutDirection
}
export interface LayoutEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  /** Incoming direction is per edge when a topic overrides its outgoing subtree structure. */
  readonly direction?: LayoutDirection
}
export interface MindMapLayout {
  readonly nodes: LayoutNode[]
  readonly edges: LayoutEdge[]
}
export interface LayoutUnit {
  readonly id: string
  readonly topic: Topic
  readonly width: number
  readonly height: number
  readonly componentId?: string
}
export interface LayoutComponent {
  readonly rootId: string
  readonly kind: LayoutKind
  readonly ids: string[]
  readonly children: Map<string, readonly string[]>
  readonly components: Map<string, string>
}
export interface LocalPlacement {
  readonly unit: LayoutUnit
  readonly x: number
  readonly y: number
  readonly direction: LayoutDirection
}
export interface LocalLayout {
  readonly placements: LocalPlacement[]
  readonly edges: LayoutEdge[]
}
export interface LayoutBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}
export function layoutBounds(placements: readonly LocalPlacement[]): LayoutBounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { unit, x, y } of placements) {
    minX = Math.min(minX, x - unit.width / 2)
    maxX = Math.max(maxX, x + unit.width / 2)
    minY = Math.min(minY, y - unit.height / 2)
    maxY = Math.max(maxY, y + unit.height / 2)
  }
  return placements.length === 0
    ? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    : { minX, minY, maxX, maxY }
}
