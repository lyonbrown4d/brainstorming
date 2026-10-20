import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import type { NativeLayoutInput, VisualGeometry } from '@shared/compute'
import { measureTopicMarkers } from '@layout'
import { topicAppearance } from '@shared/appearance'
import { markerMarkup } from '@renderer/export/markers'
import { canvasStrokePath } from '@shared/ink-path'
import { layoutDecorationPath, layoutEdgePath } from '@shared/layout-geometry'
import { sketchFillPath, topicOutlinePath, visualPath } from '@shared/sketch'

/** Reuse the live renderer's Rough.js and perfect-freehand paths for native scenes. */
export const buildVisualGeometry = (
  document: MindMapDocument,
  layout: MindMapLayout,
  measurements: NativeLayoutInput['measurements'],
): VisualGeometry => {
  const topicOutlines: Record<string, string> = {}
  const topicFills: Record<string, string> = {}
  const topicAccents: Record<string, string> = {}
  const edgePaths: Record<string, string> = {}
  const decorationPaths: Record<string, string> = {}
  const drawingPaths: Record<string, string> = {}
  const markerIcons: Record<string, string[]> = {}
  const sketch = document.settings?.visualStyle === 'sketch'
  if (sketch) {
    const branchIds = new Set(document.topics[document.rootId]?.children ?? [])
    const positions = new Map(layout.nodes.map((node) => [node.id, node]))
    for (const node of layout.nodes) {
      const topic = document.topics[node.id]
      if (!topic) continue
      const shape = topic.style?.shape ?? 'rounded'
      if (shape === 'text') continue
      const path = topicOutlinePath(shape, node.width, node.height)
      topicOutlines[node.id] = visualPath(path, 'sketch', `topic:${node.id}`)
      if (
        node.id === document.rootId ||
        branchIds.has(node.id) ||
        Boolean(topic.style?.fill) ||
        shape === 'sticky'
      )
        topicFills[node.id] = sketchFillPath(path, `topic:${node.id}`)
      if (shape === 'sticky')
        topicAccents[`${node.id}:fold`] = visualPath(
          `M${node.width * 0.84} ${node.height} V${node.height * 0.84} H${node.width}`,
          'sketch',
          `topic:${node.id}:fold`,
        )
      if (shape === 'card')
        topicAccents[`${node.id}:header`] = visualPath(
          `M${node.width * 0.08} ${node.height * 0.12} H${node.width * 0.92}`,
          'sketch',
          `topic:${node.id}:header`,
        )
    }
    for (const edge of layout.edges) {
      const source = positions.get(edge.source)
      const target = positions.get(edge.target)
      if (!source || !target || edge.routing === 'hidden') continue
      edgePaths[edge.id] = visualPath(
        layoutEdgePath(
          edge,
          source,
          target,
          document.topics[edge.target]?.style?.lineStyle === 'straight',
        ),
        'sketch',
        `edge:${edge.id}`,
      )
    }
    for (const decoration of layout.decorations ?? [])
      decorationPaths[decoration.id] = visualPath(
        layoutDecorationPath(decoration),
        'sketch',
        `decoration:${decoration.id}`,
      )
  }
  for (const stroke of document.drawings ?? []) drawingPaths[stroke.id] = canvasStrokePath(stroke)
  for (const node of layout.nodes) {
    const metadata = document.topics[node.id]?.metadata
    if (!metadata?.markers?.length) continue
    const color = topicAppearance(document, node.id).color
    const size = measureTopicMarkers(metadata).size
    markerIcons[node.id] = metadata.markers
      .slice(0, 4)
      .map((marker) => markerMarkup(marker, color, size))
  }
  return {
    measurements,
    topicOutlines,
    topicFills,
    topicAccents,
    edgePaths,
    decorationPaths,
    drawingPaths,
    markerIcons,
  }
}
