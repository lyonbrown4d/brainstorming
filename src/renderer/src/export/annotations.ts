import { translate } from '@renderer/i18n'
import type { MindMapDocument } from '@core'
import type { LayoutNode } from '@layout'
import type { Document, Element } from '@xmldom/xmldom'
import { xmlText } from '@formats/interchange/xml'
import { groupBounds, type GroupBounds } from '@renderer/components/annotations/projection'

interface ExportAnnotation extends GroupBounds {
  title: string
  color: string
  kind: 'boundary' | 'summary' | 'callout' | 'relation-label'
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
  const labels: ExportAnnotation[] = (document.relations ?? []).flatMap((relation) => {
    const from = positions.get(relation.from)
    const to = positions.get(relation.to)
    if (!from || !to || !relation.title) return []
    const lines = wrap(relation.title, 18)
    return [
      {
        x: (from.x + from.width / 2 + to.x + to.width / 2) / 2 + 8,
        y: (from.y + from.height / 2 + to.y + to.height / 2) / 2 - 24,
        width: 220,
        height: lines.length * 18,
        title: relation.title,
        color: relation.color ?? '#8b79d9',
        kind: 'relation-label',
        lines,
      },
    ]
  })
  return [
    ...groups,
    ...labels,
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
  for (const annotation of annotations) {
    const { x, y, width, height, color } = annotation
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
  if (layer !== 'underlay') return
  const positions = new Map(nodes.map((node) => [node.id, node]))
  for (const [index, relation] of (document.relations ?? []).entries()) {
    const from = positions.get(relation.from)
    const to = positions.get(relation.to)
    if (!from || !to) continue
    const color = relation.color ?? '#8b79d9'
    const right = to.x + to.width / 2 >= from.x + from.width / 2
    const x1 = from.x + (right ? from.width : 0)
    const y1 = from.y + from.height / 2
    const x2 = to.x + (right ? 0 : to.width)
    const y2 = to.y + to.height / 2
    const marker = xml.createElementNS('http://www.w3.org/2000/svg', 'marker')
    marker.setAttribute('id', `export-arrow-${index}`)
    marker.setAttribute('viewBox', '0 0 10 10')
    marker.setAttribute('refX', '9')
    marker.setAttribute('refY', '5')
    marker.setAttribute('markerWidth', '6')
    marker.setAttribute('markerHeight', '6')
    marker.setAttribute('orient', 'auto-start-reverse')
    const arrow = xml.createElementNS('http://www.w3.org/2000/svg', 'path')
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
    arrow.setAttribute('fill', color)
    marker.appendChild(arrow)
    root.appendChild(marker)
    element('path', {
      d: `M ${x1} ${y1} Q ${(x1 + x2) / 2 + 32} ${(y1 + y2) / 2 - 32} ${x2} ${y2}`,
      fill: 'none',
      stroke: color,
      'stroke-width': relation.width ?? 2,
      ...(relation.dashed ? { 'stroke-dasharray': '6 4' } : {}),
      ...(relation.arrow === 'both' ? { 'marker-start': `url(#export-arrow-${index})` } : {}),
      ...(relation.arrow === 'none' ? {} : { 'marker-end': `url(#export-arrow-${index})` }),
    })
  }
}
