import type { MindMapDocument } from '@core'
import type { Document, Element } from '@xmldom/xmldom'
import { canvasStrokePath } from '@shared/ink-path'

export const inkExtents = (document: MindMapDocument) =>
  (document.drawings ?? []).map((stroke) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
    const transform = stroke.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1 }
    return {
      x: (minX - stroke.width) * transform.scaleX + transform.x,
      y: (minY - stroke.width) * transform.scaleY + transform.y,
      width: (maxX - minX + stroke.width * 2) * transform.scaleX,
      height: (maxY - minY + stroke.width * 2) * transform.scaleY,
    }
  })

export const drawExportInk = (xml: Document, parent: Element, document: MindMapDocument): void => {
  for (const stroke of document.drawings ?? []) {
    const path = xml.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', canvasStrokePath(stroke))
    path.setAttribute('fill', stroke.color)
    path.setAttribute('data-drawing-id', stroke.id)
    parent.appendChild(path)
  }
}
