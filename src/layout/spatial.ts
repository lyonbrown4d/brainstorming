import { getSubtreeIds } from '@core/tree'
import type { MindMapDocument } from '@core'
import { layoutDocument } from './index'
import type { LayoutNode } from './index'
import {
  projectSpatialGeometry,
  type SpatialDecoration,
  type SpatialEdge,
} from './spatial-geometry'
export type { SpatialDecoration, SpatialEdge } from './spatial-geometry'

export type SpatialPoint = readonly [number, number, number]

export interface SpatialNode {
  readonly id: string
  /** Center position; one world unit represents 100 CSS pixels. */
  readonly position: SpatialPoint
  readonly width: number
  readonly height: number
  readonly branchId: string
  readonly depth: number
}

export interface SpatialBounds {
  readonly min: SpatialPoint
  readonly max: SpatialPoint
}

export interface SpatialLayout {
  readonly nodes: SpatialNode[]
  readonly edges: SpatialEdge[]
  readonly decorations: SpatialDecoration[]
  readonly bounds: SpatialBounds
}

interface BranchGroup {
  readonly id: string
  readonly side: 'left' | 'right'
  readonly z: number
  readonly floating: boolean
  minY: number
  maxY: number
  offsetY: number
}

const PIXELS_PER_UNIT = 100
const BRANCH_GAP = 1

/**
 * Preserve the measured tidy-tree layout within each branch, then pack whole branches
 * with a generous gap. Gentle depth layers keep the default elevated front view legible.
 * This projection is transient: it never changes topic order, content, or document history.
 */
export function layoutSpatialDocument(document: MindMapDocument): SpatialLayout {
  const planar = layoutDocument(document)
  const root = document.topics[document.rootId]
  if (root === undefined) throw new Error('缺少中心主题')
  const floating = new Set(document.floatingIds ?? [])
  const branches = root.children.filter((id) => floating.has(id) || !root.collapsed)
  const preservePlanar =
    (document.settings?.layout ?? 'map') !== 'map' ||
    Object.values(document.topics).some(
      (topic) => topic.structure !== undefined && topic.structure !== 'map',
    )
  const normalBranches = branches.filter((id) => !floating.has(id))
  const normalIndex = new Map(normalBranches.map((id, index) => [id, index]))
  const floatingIndex = new Map([...floating].map((id, index) => [id, index]))
  const groups = new Map<string, BranchGroup>()
  for (const id of branches) {
    const topic = document.topics[id]
    if (topic === undefined) continue
    groups.set(id, {
      id,
      side: topic.side,
      floating: floating.has(id),
      z:
        preservePlanar && !floating.has(id)
          ? 0
          : floating.has(id)
            ? 0.7 + Math.min(2, (floatingIndex.get(id) ?? 0) * 0.3)
            : normalBranches.length < 2
              ? 0.7
              : ((normalIndex.get(id) ?? 0) / (normalBranches.length - 1) - 0.5) * 2.4,
      minY: Infinity,
      maxY: -Infinity,
      offsetY: 0,
    })
  }
  const ancestry = new Map<string, { branchId: string; depth: number }>()
  const pending = [...floating].map((id) => ({ id, branchId: id, depth: 1 }))
  pending.push({ id: root.id, branchId: root.id, depth: 0 })
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) break
    ancestry.set(current.id, current)
    const topic = document.topics[current.id]
    if (topic === undefined || topic.collapsed) continue
    for (let index = topic.children.length - 1; index >= 0; index -= 1) {
      const id = topic.children[index]
      if (id !== undefined && (current.id !== root.id || !floating.has(id)))
        pending.push({
          id,
          branchId: current.depth === 0 ? id : current.branchId,
          depth: current.depth + 1,
        })
    }
  }
  for (const node of planar.nodes) {
    const branchId = ancestry.get(node.id)?.branchId
    const group = branchId === undefined ? undefined : groups.get(branchId)
    if (group === undefined) continue
    group.minY = Math.min(group.minY, node.y / PIXELS_PER_UNIT)
    group.maxY = Math.max(group.maxY, (node.y + node.height) / PIXELS_PER_UNIT)
  }
  for (const side of ['left', 'right'] as const) {
    const sideGroups = [...groups.values()].filter(
      (group) => group.side === side && !group.floating && !preservePlanar,
    )
    const height = sideGroups.reduce((sum, group) => sum + group.maxY - group.minY, 0)
    let cursor = -(height + Math.max(0, sideGroups.length - 1) * BRANCH_GAP) / 2
    for (const group of sideGroups) {
      group.offsetY = cursor - group.minY
      cursor += group.maxY - group.minY + BRANCH_GAP
    }
  }
  const nodes = planar.nodes.map((node): SpatialNode => {
    const { branchId, depth } = ancestry.get(node.id) ?? { branchId: root.id, depth: 0 }
    return spatialNode(node, branchId, depth, groups.get(branchId), preservePlanar)
  })
  const geometry = projectSpatialGeometry(
    planar,
    nodes,
    root.id,
    new Set(
      Object.values(document.topics)
        .filter((topic) => topic.style?.lineStyle === 'straight')
        .map((topic) => topic.id),
    ),
  )
  return { nodes, ...geometry, bounds: spatialBounds([...nodes, ...geometry.decorations]) }
}

function spatialNode(
  node: LayoutNode,
  branchId: string,
  depth: number,
  group: BranchGroup | undefined,
  preservePlanar: boolean,
): SpatialNode {
  // Descendants stay close to their main branch's plane, even for very deep trees.
  const depthOffset = preservePlanar ? 0 : Math.min(0.36, Math.max(0, depth - 1) * 0.12)
  return {
    id: node.id,
    position:
      group === undefined
        ? depth === 0
          ? [0, 0, 0]
          : [
              (node.x + node.width / 2) / PIXELS_PER_UNIT,
              -(node.y + node.height / 2) / PIXELS_PER_UNIT,
              0,
            ]
        : [
            (node.x + node.width / 2) / PIXELS_PER_UNIT,
            -((node.y + node.height / 2) / PIXELS_PER_UNIT + group.offsetY),
            group.z + depthOffset * (group.side === 'left' ? -1 : 1),
          ],
    width: node.width / PIXELS_PER_UNIT,
    height: node.height / PIXELS_PER_UNIT,
    branchId,
    depth,
  }
}

/** Includes collapsed descendants; intersect with visible layout nodes when focusing. */
export function spatialSubtreeIds(document: MindMapDocument, id: string): Set<string> {
  return new Set(getSubtreeIds(document, id))
}

/** Axis-aligned bounds include each card's width and height, with no camera padding. */
export function spatialBounds(
  nodes: readonly Pick<SpatialNode, 'position' | 'width' | 'height'>[],
): SpatialBounds {
  if (nodes.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] }
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const {
    position: [x, y, z],
    width,
    height,
  } of nodes) {
    min[0] = Math.min(min[0], x - width / 2)
    min[1] = Math.min(min[1], y - height / 2)
    min[2] = Math.min(min[2], z)
    max[0] = Math.max(max[0], x + width / 2)
    max[1] = Math.max(max[1], y + height / 2)
    max[2] = Math.max(max[2], z)
  }
  return { min, max }
}
