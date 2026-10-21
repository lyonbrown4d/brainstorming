import type { SpatialView } from '@renderer/state/spatialView'
import { relationAnchors } from '@shared/relation-geometry'
import { visualPath } from '@shared/sketch'
import { layoutDocument, type LayoutNode, type MindMapLayout } from '@layout'
import type { MindMapDocument } from '@core'
import { topicAppearance } from '@shared/appearance'
import { layoutEdgePath } from '@shared/layout-geometry'
import { relationEdges } from '@renderer/components/annotations/projection'
import { projectInk, type CanvasFlowNode } from '@renderer/lib/canvasNodes'
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
export const projectCanvas = (
  document: MindMapDocument,
  surface?: string,
  layout: MindMapLayout = layoutDocument(document),
  spatial?: SpatialView,
) => {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  const orderedDepths = layout.nodes
    .filter((node) => node.cameraDepth !== undefined)
    .sort(
      (a, b) =>
        (a.cameraDepth ?? 0) - (b.cameraDepth ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
  const layers = new Map(
    orderedDepths.map((node, index) => [
      node.id,
      orderedDepths.length === 1 ? 250 : Math.round((index * 500) / (orderedDepths.length - 1)),
    ]),
  )
  const relationsById = new Map(
    (document.relations ?? []).map((relation) => [`relation-${relation.id}`, relation]),
  )
  const orderedNodes = orderedDepths.length === layout.nodes.length ? orderedDepths : layout.nodes
  const nodes: TopicFlowNode[] = orderedNodes.flatMap((node) => {
    const topic = document.topics[node.id]
    if (!topic) return []
    const appearance = topicAppearance(document, node.id, surface)
    const zIndex = layers.get(node.id)
    return [
      {
        id: node.id,
        type: 'topic' as const,
        position: { x: node.x, y: node.y },
        ...(zIndex === undefined ? {} : { zIndex }),
        // Known layout dimensions keep fresh nodes visible when Lexical takes focus.
        initialWidth: node.width,
        initialHeight: node.height,
        style: { width: node.width, height: node.height },
        data: {
          topic,
          visualStyle: document.settings?.visualStyle ?? 'normal',
          root: node.id === document.rootId,
          branch: document.topics[document.rootId]?.children.includes(node.id) ?? false,
          fill: appearance.fill,
          color: appearance.stroke,
          textColor: appearance.color,
          fontFamily: appearance.fontFamily,
          ...(node.cameraScale === undefined ? {} : { cameraScale: node.cameraScale }),
          ...(node.worldWidth === undefined ? {} : { worldWidth: node.worldWidth }),
          ...(node.worldHeight === undefined ? {} : { worldHeight: node.worldHeight }),
          ...(node.cameraDepth === undefined ? {} : { cameraDepth: node.cameraDepth }),
          ...(node.direction ? { direction: node.direction } : {}),
        },
        draggable: true,
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
          edge.routing || edge.waypoints || document.settings?.visualStyle === 'sketch'
            ? 'structure'
            : document.topics[edge.target]?.style?.lineStyle === 'straight'
              ? 'straight'
              : 'default',
        ...(source &&
        target &&
        (edge.routing || edge.waypoints || document.settings?.visualStyle === 'sketch')
          ? {
              data: {
                liveGeometry: {
                  edge,
                  source,
                  target,
                  straight: document.topics[edge.target]?.style?.lineStyle === 'straight',
                },
                visualStyle: document.settings?.visualStyle ?? 'normal',
                path: visualPath(
                  layoutEdgePath(
                    edge,
                    source,
                    target,
                    document.topics[edge.target]?.style?.lineStyle === 'straight',
                  ),
                  document.settings?.visualStyle,
                  `edge:${edge.id}`,
                ),
              },
            }
          : {}),
        ...(source && target
          ? edgeHandles(source, target, edge.direction ?? document.topics[edge.target]?.side)
          : {}),
        style: {
          stroke: topicAppearance(document, edge.target, surface).stroke,
          strokeWidth: topicAppearance(document, edge.target, surface).lineWidth,
        },
        selectable: false,
      }
    })
  return {
    nodes: [...nodes, ...projectInk(document, spatial)] as CanvasFlowNode[],
    edges: [
      ...edges,
      ...relationEdges(document, new Set(byId.keys())).map((edge) => {
        const source = byId.get(edge.source),
          target = byId.get(edge.target)
        const relation = relationsById.get(edge.id)
        if (!source || !target || !relation) return edge
        const anchors = relationAnchors(relation, source, target)
        return {
          ...edge,
          sourceHandle: `source-${anchors.source}`,
          targetHandle: `target-${anchors.target}`,
        }
      }),
    ],
    layoutNodes: layout.nodes,
    decorations: layout.decorations ?? [],
  }
}
