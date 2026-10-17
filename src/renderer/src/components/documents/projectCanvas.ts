import { layoutDocument, type LayoutNode } from '@layout'
import type { MindMapDocument } from '@core'
import { topicAppearance } from '@shared/appearance'
import { layoutEdgePath } from '@shared/layout-geometry'
import { relationEdges } from '@renderer/components/annotations/projection'
import type { TopicFlowNode } from '@renderer/components/TopicNode'

export const edgeHandles = (
  source: LayoutNode,
  target: LayoutNode,
  direction?: 'left' | 'right' | 'up' | 'down',
) => {
  const dx = target.x + target.width / 2 - source.x - source.width / 2
  const dy = target.y + target.height / 2 - source.y - source.height / 2
  if (direction) {
    const sides = {
      left: ['left', 'right'],
      right: ['right', 'left'],
      up: ['top', 'bottom'],
      down: ['bottom', 'top'],
    } as const
    const [from, to] = sides[direction]
    return { sourceHandle: `source-${from}`, targetHandle: `target-${to}` }
  }
  const vertical = Math.abs(dy) > Math.abs(dx)
  const from = vertical ? (dy > 0 ? 'bottom' : 'top') : dx > 0 ? 'right' : 'left'
  const to = vertical ? (dy > 0 ? 'top' : 'bottom') : dx > 0 ? 'left' : 'right'
  return { sourceHandle: `source-${from}`, targetHandle: `target-${to}` }
}
export const projectCanvas = (document: MindMapDocument) => {
  const layout = layoutDocument(document)
  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  const nodes: TopicFlowNode[] = layout.nodes.flatMap((node) => {
    const topic = document.topics[node.id]
    if (!topic) return []
    const appearance = topicAppearance(document, node.id)
    return [
      {
        id: node.id,
        type: 'topic' as const,
        position: { x: node.x, y: node.y },
        // Known layout dimensions keep fresh nodes visible when Lexical takes focus.
        initialWidth: node.width,
        initialHeight: node.height,
        style: { width: node.width, height: node.height },
        data: {
          topic,
          root: node.id === document.rootId,
          branch: document.topics[document.rootId]?.children.includes(node.id) ?? false,
          fill: appearance.fill,
          color: appearance.stroke,
          textColor: appearance.color,
          fontFamily: appearance.fontFamily,
          ...(node.direction ? { direction: node.direction } : {}),
        },
        draggable: node.id !== document.rootId,
      },
    ]
  })
  const edges = layout.edges
    .filter((edge) => edge.routing !== 'hidden')
    .map((edge) => {
      const source = byId.get(edge.source),
        target = byId.get(edge.target)
      return {
        ...edge,
        type:
          edge.routing || edge.waypoints
            ? 'structure'
            : document.topics[edge.target]?.style?.lineStyle === 'straight'
              ? 'straight'
              : 'default',
        ...(source && target && (edge.routing || edge.waypoints)
          ? {
              data: {
                path: layoutEdgePath(
                  edge,
                  source,
                  target,
                  document.topics[edge.target]?.style?.lineStyle === 'straight',
                ),
              },
            }
          : {}),
        ...(source && target
          ? edgeHandles(source, target, edge.direction ?? document.topics[edge.target]?.side)
          : {}),
        style: {
          stroke: topicAppearance(document, edge.target).stroke,
          strokeWidth: topicAppearance(document, edge.target).lineWidth,
        },
        selectable: false,
      }
    })
  return {
    nodes,
    edges: [
      ...edges,
      ...relationEdges(document, new Set(byId.keys())).map((edge) => {
        const source = byId.get(edge.source),
          target = byId.get(edge.target)
        return source && target ? { ...edge, ...edgeHandles(source, target) } : edge
      }),
    ],
    layoutNodes: layout.nodes,
    decorations: layout.decorations ?? [],
  }
}
