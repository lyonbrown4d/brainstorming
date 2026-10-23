import type { LayoutNode } from '@layout'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'

/** Preview transforms stay in the Three runtime and never change document/layout records. */
export const sceneNode = (runtime: IndependentSpatialRuntime, node: LayoutNode): LayoutNode => {
  const offset = runtime.offsets.get(node.id)
  const scale = runtime.scales.get(node.id) ?? 1
  const width = node.width * scale
  const height = node.height * scale
  return {
    ...node,
    x: node.x + (offset?.x ?? 0) + (node.width - width) / 2,
    y: node.y + (offset?.y ?? 0) + (node.height - height) / 2,
    width,
    height,
  }
}
