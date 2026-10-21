import type { MindMapLayout } from '@layout'

/** The ground sits below the lowest canonical topic, independent of the camera angle. */
export const stageFloorHeight = (layout: MindMapLayout): number =>
  layout.nodes.reduce((lowest, node) => Math.max(lowest, node.y + node.height), 0) + 100

/** Keep the grid broad enough to frame the visible diagram without growing without bound. */
export const stageFloorExtent = (layout: MindMapLayout, visibleWidth: number): number => {
  const bounds = layout.nodes.reduce(
    (result, node) => ({
      minX: Math.min(result.minX, node.x),
      maxX: Math.max(result.maxX, node.x + node.width),
    }),
    { minX: 0, maxX: 0 },
  )
  return Math.min(12000, Math.max(1800, bounds.maxX - bounds.minX + 800, visibleWidth * 2))
}
