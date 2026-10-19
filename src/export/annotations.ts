import { relationExportAnnotations, drawExportRelations } from '@renderer/export/relations'
import { translate } from '@renderer/i18n'
import type { MindMapDocument } from '@core'
import type { LayoutNode } from '@layout'
import type { Document, Element } from '@xmldom/xmldom'
import { xmlText } from '@formats/interchange/xml'
import { groupBounds, type GroupBounds } from '@renderer/components/annotations/projection'

export interface ExportAnnotation extends GroupBounds {
  title: string
  color: string
  kind: 'boundary' | 'summary' | 'callout' | 'relation-label' | 'relation-path'
  lines: string[]
}
const wrap = (text: string, columns = 22): string[] => {
  return text.split('\n').flatMap((line) => {
    const characters = Array.from(line)
    const lines: string[] = []
    for (let offset = 0; offset < characters.length; offset += columns)
      lines.push(characters.slice(offset, offset + columns).join(''))
    return lines.length ? lines : ['']
  })
}
export const exportAnnotations = (
  document: MindMapDocument,
  nodes: readonly LayoutNode[],
): ExportAnnotation[] => {
  const positions = new Map(nodes.map((node) => [node.id, node]))
  const groups: ExportAnnotation[] = (document.groups ?? []).flatMap((group) => {
    const bounds = groupBounds(
      group.topicIds.flatMap((id) => {
        const node = positions.get(id)
        return node ? [node] : []
      }),
    )
    return bounds
      ? [
          {
            ...bounds,
            title:
              group.title ??
              (group.kind === 'boundary' ? translate('boundary') : translate('summary')),
            color: group.color ?? '#8b79d9',
            kind: group.kind,
            lines: wrap(
              group.title ??
                (group.kind === 'boundary' ? translate('boundary') : translate('summary')),
              20,
            ),
          },
        ]
      : []
  })

  return [
    ...groups,
    ...relationExportAnnotations(document, nodes),
    ...(document.callouts ?? []).flatMap((callout): ExportAnnotation[] => {
      const node = positions.get(callout.topicId)
      if (!node) return []
      const lines = wrap(callout.text, 14)
      return [
        {
          x: node.x + node.width + 14,
          y: node.y - 16,
          width: 192,
          height: lines.length * 18 + 16,
          title: callout.text,
          color: '#92400e',
          kind: 'callout',
          lines,
        },
      ]
    }),
  ]
}
export const annotationExtents = (annotations: readonly ExportAnnotation[]): GroupBounds[] => {
  return annotations.map((annotation) => {
    const captionHeight =
      annotation.kind === 'boundary' || annotation.kind === 'summary'
        ? annotation.lines.length * 18 + 8
        : 0
    return {
      ...annotation,
      x: annotation.x,
      y: annotation.y - captionHeight,
      width:
        annotation.width +
        (annotation.kind === 'summary'
          ? Math.min(240, Array.from(annotation.title).length * 12) + 24
          : annotation.kind === 'boundary'
            ? Math.max(0, 240 - annotation.width)
            : 0),
      height: annotation.height + captionHeight,
    }
  })
}
export const drawExportAnnotations = (
  xml: Document,
  root: Element,
  document: MindMapDocument,
  nodes: readonly LayoutNode[],
  annotations: readonly ExportAnnotation[],
  layer: 'underlay' | 'overlay',
): void => {
  const element = (name: string, attrs: Record<string, string | number>): Element => {
    const node = xml.createElementNS('http://www.w3.org/2000/svg', name)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    root.appendChild(node)
    return node
  }
  const text = (value: string, x: number, y: number, color: string) =>
    element('text', {
      x,
      y,
      fill: color,
      'font-size': 12,
      'font-family': 'system-ui, sans-serif',
    }).appendChild(xml.createTextNode(xmlText(value)))
  if (layer === 'underlay') drawExportRelations(xml, root, document, nodes)
  for (const annotation of annotations) {
    const { x, y, width, height, color } = annotation
    if (annotation.kind === 'relation-path') continue
    if (annotation.kind === 'relation-label') {
      if (layer === 'underlay') {
        element('rect', {
          x: x - 4,
          y: y - 2,
          width,
          height,
          fill: '#ffffff',
          'fill-opacity': 0.94,
          rx: 4,
        })
        annotation.lines.forEach((line, index) => {
          text(line, x, y + 12 + index * 18, color)
        })
      }
    } else if (annotation.kind === 'callout') {
      if (layer !== 'overlay') continue
      element('rect', { x, y, width, height, rx: 8, fill: '#fffbeb', stroke: '#fcd34d' })
      annotation.lines.forEach((line, index) => {
        text(line, x + 12, y + 20 + index * 18, color)
      })
    } else if (layer === 'underlay') {
      if (annotation.kind === 'boundary')
        element('rect', {
          x,
          y,
          width,
          height,
          rx: 12,
          fill: color,
          'fill-opacity': 0.04,
          stroke: color,
          'stroke-width': 2,
          'stroke-dasharray': '6 4',
        })
      else
        element('path', {
          d: `M ${x + width - 8} ${y} h 8 v ${height} h -8`,
          fill: 'none',
          stroke: color,
          'stroke-width': 2,
        })
      annotation.lines.forEach((line, index) => {
        text(
          line,
          annotation.kind === 'summary' ? x + width + 8 : x + 8,
          y - 8 - (annotation.lines.length - 1 - index) * 18,
          color,
        )
      })
    }
  }
}
