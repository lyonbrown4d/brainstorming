import { DOMParser, type Document, type Element } from '@xmldom/xmldom'
import { brandMarkerIcon } from '@shared/markerIcons'

/** Only vectors from the bundled icon collection can enter the export document. */
export function drawMarkerIcons(
  xml: Document,
  parent: Element,
  markers: readonly string[],
  width: number,
  baseline: number,
  color: string,
  hasText: boolean,
): number {
  const icons = markers
    .flatMap((marker) => {
      const vector = brandMarkerIcon(marker)
      return vector ? [{ marker, vector }] : []
    })
    .slice(0, 4)
  const reserved = icons.length ? icons.length * 16 + 8 : 0
  const start = hasText ? 12 : (width - icons.length * 16) / 2
  icons.forEach(({ marker, vector }, index) => {
    const source = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${vector.body}</svg>`,
      'image/svg+xml',
    ).documentElement
    if (!source) return
    const icon = xml.importNode(source, true)
    icon.setAttribute('x', String(start + index * 16))
    icon.setAttribute('y', String(baseline - 11))
    icon.setAttribute('width', '12')
    icon.setAttribute('height', '12')
    icon.setAttribute('viewBox', `0 0 ${vector.width} ${vector.height}`)
    icon.setAttribute('fill', color)
    icon.setAttribute('data-marker', marker)
    parent.appendChild(icon)
  })
  return reserved
}
