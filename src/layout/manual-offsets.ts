import type { MindMapDocument } from '@core'
import type { MindMapLayout, LayoutPoint } from '@layout/types'

/** Translate subtrees without changing hierarchy or layout algorithms. Floating roots are independent. */
export const applyManualOffsets = (
  document: MindMapDocument,
  layout: MindMapLayout,
): MindMapLayout => {
  if (
    !Object.values(document.topics).some(
      (topic) => (topic.style?.offsetX ?? 0) !== 0 || (topic.style?.offsetY ?? 0) !== 0,
    )
  )
    return layout
  const parents = new Map<string, string>()
  for (const topic of Object.values(document.topics))
    for (const id of topic.children) parents.set(id, topic.id)
  const floating = new Set(document.floatingIds)
  const offsets = new Map<string, LayoutPoint>()
  const offset = (id: string): LayoutPoint => {
    const chain: string[] = []
    let current: string | undefined = id
    while (current !== undefined && !offsets.has(current)) {
      chain.push(current)
      current = floating.has(current) ? undefined : parents.get(current)
    }
    let value = current === undefined ? { x: 0, y: 0 } : (offsets.get(current) ?? { x: 0, y: 0 })
    for (const key of chain.reverse()) {
      const style = document.topics[key]?.style
      value = { x: value.x + (style?.offsetX ?? 0), y: value.y + (style?.offsetY ?? 0) }
      offsets.set(key, value)
    }
    return value
  }
  return {
    nodes: layout.nodes.map((node) => {
      const delta = offset(node.id)
      return { ...node, x: node.x + delta.x, y: node.y + delta.y }
    }),
    edges: layout.edges.map((edge) => {
      if (!edge.waypoints) return edge
      const start = offset(edge.source),
        end = offset(edge.target)
      return {
        ...edge,
        waypoints: edge.waypoints.map((point, index, all) => {
          const t = all.length > 1 ? index / (all.length - 1) : 0
          return {
            x: point.x + start.x * (1 - t) + end.x * t,
            y: point.y + start.y * (1 - t) + end.y * t,
          }
        }),
      }
    }),
    ...(layout.decorations
      ? {
          decorations: layout.decorations.map((item) => {
            const delta = offset(item.topicId ?? document.rootId)
            return { ...item, x: item.x + delta.x, y: item.y + delta.y }
          }),
        }
      : {}),
  }
}
