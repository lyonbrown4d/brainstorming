import { hierarchy, tree } from 'd3-hierarchy'
import type { MindMapDocument, Topic } from '@core'
import { measureTopic } from '@layout/measure'

import type { LayoutNode, LayoutEdge, MindMapLayout } from '@layout/types'

/** Return top-left positions. The center of the root is (0, 0). */
export const layoutMapDocument = (document: MindMapDocument): MindMapLayout => {
  const root = document.topics[document.rootId]
  if (root === undefined) throw new Error('缺少中心主题')
  const rootSize = measureTopic(root.title, true, root.style?.fontSize, root)
  const nodes: LayoutNode[] = [
    { id: root.id, x: -rootSize.width / 2, y: -rootSize.height / 2, ...rootSize, side: 'right' },
  ]
  const edges: LayoutEdge[] = []
  if (root.collapsed) return { nodes, edges }
  const measurements = new Map<string, { width: number; height: number }>([[root.id, rootSize]])
  const sizeOf = (topic: Topic) => {
    let size = measurements.get(topic.id)
    if (size === undefined) {
      size = measureTopic(topic.title, false, topic.style?.fontSize, topic)
      measurements.set(topic.id, size)
    }
    return size
  }
  for (const side of ['left', 'right'] as const) {
    const branchTree = hierarchy(root, (topic) => {
      if (topic.collapsed) return []
      const children: Topic[] = []
      for (const id of topic.children) {
        const child = document.topics[id]
        if (child && (topic.id !== root.id || child.side === side)) children.push(child)
      }
      return children
    })
    // d3's iterative tidy-tree walk supports deep trees. Separation uses actual estimated heights.
    const positioned = tree<Topic>()
      .nodeSize([1, 1])
      .separation((a, b) => (sizeOf(a.data).height + sizeOf(b.data).height) / 2 + 24)(branchTree)
    const maxWidths: number[] = [rootSize.width]
    positioned.eachBefore((node) => {
      maxWidths[node.depth] = Math.max(maxWidths[node.depth] ?? 0, sizeOf(node.data).width)
    })
    const depthOffsets: number[] = [0]
    for (let depth = 1; depth < maxWidths.length; depth += 1) {
      depthOffsets[depth] =
        (depthOffsets[depth - 1] ?? 0) +
        (maxWidths[depth - 1] ?? 0) / 2 +
        72 +
        (maxWidths[depth] ?? 0) / 2
    }
    positioned.eachBefore((node) => {
      if (node.depth === 0) return
      const size = sizeOf(node.data)
      const centerX = (depthOffsets[node.depth] ?? 0) * (side === 'left' ? -1 : 1)
      nodes.push({
        id: node.data.id,
        x: centerX - size.width / 2,
        y: node.x - size.height / 2,
        ...size,
        side,
      })
      if (node.parent !== null)
        edges.push({
          id: `edge-${node.data.id}`,
          source: node.parent.data.id,
          target: node.data.id,
        })
    })
  }
  return { nodes, edges }
}
