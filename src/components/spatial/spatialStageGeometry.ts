import type { Viewport } from '@xyflow/react'
import type { LayoutNode, MindMapLayout } from '@layout'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { projectSpatialPoint, unprojectSpatialPoint } from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

export const stageFloorDepth = (
  layout: MindMapLayout,
  depths: Readonly<Record<string, number>>,
): number => {
  const lowest = layout.nodes.reduce((minimum, node) => Math.min(minimum, depths[node.id] ?? 0), 0)
  return lowest - 80
}

/** One line segment per visible topic, in physical Three coordinates. */
export const stageDepthSegments = (
  layout: MindMapLayout,
  depths: Readonly<Record<string, number>>,
  nodes: readonly CanvasFlowNode[],
  viewport: Viewport,
  screen: { readonly width: number; readonly height: number },
  floorDepth: number,
  view: SpatialView,
  bases: ReadonlyMap<string, LayoutNode> = new Map(layout.nodes.map((node) => [node.id, node])),
): Float32Array => {
  const segments: number[] = []
  for (const node of nodes) {
    if (node.type !== 'topic') continue
    const width = node.measured?.width ?? node.initialWidth ?? 100
    const height = node.measured?.height ?? node.initialHeight ?? 50
    const left = node.position.x * viewport.zoom + viewport.x
    const top = node.position.y * viewport.zoom + viewport.y
    if (
      left + width * viewport.zoom < -40 ||
      top + height * viewport.zoom < -40 ||
      left > screen.width + 40 ||
      top > screen.height + 40
    )
      continue
    const base = bases.get(node.id)
    if (!base) continue
    const depth = depths[node.id] ?? 0
    const projectedDepth = projectSpatialPoint(
      { x: base.x + base.width / 2, y: base.y + base.height / 2, z: depth },
      view,
    ).z
    const anchor = unprojectSpatialPoint(
      { x: node.position.x + width / 2, y: node.position.y + height / 2, z: projectedDepth },
      view,
    )
    segments.push(anchor.x, -anchor.y, floorDepth, anchor.x, -anchor.y, anchor.z)
    if (segments.length === 128 * 6) break
  }
  return new Float32Array(segments)
}
