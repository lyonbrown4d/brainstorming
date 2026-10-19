import { visualPath } from '@shared/sketch'
import type { Document, Element } from '@xmldom/xmldom'
import type { MindMapDocument } from '@core'
import type { MindMapLayout } from '@layout'
import { topicAppearance } from '@shared/appearance'
import { layoutDecorationPath } from '@shared/layout-geometry'

export const structureExtents = (layout: MindMapLayout) => {
  return [
    ...(layout.decorations ?? []),
    ...layout.edges.flatMap((edge) =>
      (edge.waypoints ?? []).map(({ x, y }) => ({ x, y, width: 0, height: 0 })),
    ),
  ]
}

export const drawStructureGeometry = (
  xml: Document,
  root: Element,
  document: MindMapDocument,
  layout: MindMapLayout,
): void => {
  for (const decoration of layout.decorations ?? []) {
    const appearance = topicAppearance(document, decoration.topicId ?? document.rootId)
    const cell = decoration.kind === 'cell'
    const element = xml.createElementNS(
      'http://www.w3.org/2000/svg',
      cell && document.settings?.visualStyle !== 'sketch' ? 'rect' : 'path',
    )
    const attrs: Record<string, string | number> = {
      'data-structure-kind': decoration.kind,
      stroke: appearance.stroke,
      'stroke-width': cell || decoration.kind === 'grid-line' ? 1 : appearance.lineWidth,
      ...(decoration.kind === 'grid-line' ? { 'stroke-opacity': 0.4 } : {}),
      fill: cell ? appearance.stroke : 'none',
      ...(cell && document.settings?.visualStyle !== 'sketch'
        ? {
            x: decoration.x,
            y: decoration.y,
            width: decoration.width,
            height: decoration.height,
            'fill-opacity': 0.035,
            'stroke-opacity': 0.4,
          }
        : {
            d: visualPath(
              layoutDecorationPath(decoration),
              document.settings?.visualStyle,
              `decoration:${decoration.id}`,
            ),
            ...(cell ? { 'fill-opacity': 0.035, 'stroke-opacity': 0.4 } : {}),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
    }
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value))
    root.appendChild(element)
  }
}
