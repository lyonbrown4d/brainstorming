import { DOMParser, type Document, type Element } from '@xmldom/xmldom'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TopicMetadata } from '@core'
import { measureTopicMarkers } from '@layout'
import { brandMarkerIcon } from '@shared/markerIcons'
import { markerOptions } from '@renderer/components/metadata/markers'
/** Only bundled brand vectors and known Lucide components can enter the export document. */
export const drawMarkerIcons = (
  xml: Document,
  parent: Element,
  metadata: TopicMetadata | undefined,
  width: number,
  bodyHeight: number,
  color: string,
): {
  contentX: number
  contentY: number
  contentWidth: number
} => {
  const bounds = measureTopicMarkers(metadata)
  const { size, position } = bounds
  const contentX = position === 'left' ? bounds.extraWidth - 24 : position === 'right' ? 24 : 0
  const contentY = position === 'top' ? bounds.extraHeight : 0
  const x =
    position === 'left'
      ? 24
      : position === 'right'
        ? width - bounds.width - 24
        : (width - bounds.width) / 2
  const y =
    position === 'top' ? 6 : position === 'bottom' ? bodyHeight - size - 6 : (bodyHeight - size) / 2
  const markers = metadata?.markers ?? []
  markers.slice(0, 4).forEach((marker, index) => {
    const vector = brandMarkerIcon(marker)
    const known =
      markerOptions.find((option) => option.value === marker) ??
      markerOptions.find((option) => option.value === 'question')
    const markup = vector
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vector.width} ${vector.height}" fill="${color}">${vector.body}</svg>`
      : known
        ? renderToStaticMarkup(createElement(known.Icon, { color, size }))
        : ''
    const source = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
    if (!source) return
    const icon = xml.importNode(source, true)
    icon.setAttribute('x', String(x + index * (size + 4)))
    icon.setAttribute('y', String(y))
    icon.setAttribute('width', String(size))
    icon.setAttribute('height', String(size))
    icon.setAttribute('data-marker', marker)
    parent.appendChild(icon)
  })
  if (markers.length > 4) {
    const text = xml.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', String(x + 4 * (size + 4)))
    text.setAttribute('y', String(y + size / 2 + 4))
    text.setAttribute('fill', color)
    text.setAttribute('font-size', '10')
    text.appendChild(xml.createTextNode(`+${markers.length - 4}`))
    parent.appendChild(text)
  }
  return { contentX, contentY, contentWidth: width - bounds.extraWidth }
}
