import { MarkerType, type Edge } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import { topicAppearance } from '@shared/appearance'

export { groupBounds, type GroupBounds } from '@shared/group-geometry'
export const relationEdges = (
  document: MindMapDocument,
  visibleIds: ReadonlySet<string>,
): Edge[] => {
  return (document.relations ?? []).flatMap((relation) => {
    if (!visibleIds.has(relation.from) || !visibleIds.has(relation.to)) return []
    const color = relation.color ?? topicAppearance(document, relation.from).stroke
    const arrow = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
    return [
      {
        id: `relation-${relation.id}`,
        source: relation.from,
        target: relation.to,
        label: relation.title,
        type: 'relation',
        selectable: true,
        reconnectable: true,
        style: {
          stroke: color,
          strokeWidth: relation.width ?? 2,
          strokeDasharray: relation.dashed ? '6 4' : undefined,
        },
        ...(relation.arrow === 'both' ? { markerStart: arrow } : {}),
        ...(relation.arrow === 'none' ? {} : { markerEnd: arrow }),
        labelStyle: { fill: color, fontSize: 12 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.94 },
      },
    ]
  })
}
