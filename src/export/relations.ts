import type { MindMapDocument } from '@core'
import type { LayoutNode } from '@layout'
import type { Document, Element } from '@xmldom/xmldom'
import { relationLayoutGeometry } from '@shared/relation-geometry'
import { topicAppearance } from '@shared/appearance'
import { translate } from '@renderer/i18n'
import type { ExportAnnotation } from '@renderer/export/annotations'

export const relationExportAnnotations = (
  document: MindMapDocument,
  nodes: readonly LayoutNode[],
): ExportAnnotation[] => {
  const positions = new Map(nodes.map((node) => [node.id, node]))
  return (document.relations ?? []).flatMap((relation): ExportAnnotation[] => {
    const from = positions.get(relation.from),
      to = positions.get(relation.to)
    if (!from || !to) return []
    const geometry = relationLayoutGeometry(relation, from, to)
    const color = relation.color ?? topicAppearance(document, relation.from).stroke
    const title = relation.title?.trim() ? relation.title : translate('relationship')
    const lines = title.split('\n').flatMap((line) => {
      const characters = Array.from(line)
      return Array.from({ length: Math.max(1, Math.ceil(characters.length / 18)) }, (_, index) =>
        characters.slice(index * 18, index * 18 + 18).join(''),
      )
    })
    const width = Math.max(...lines.map((line) => Array.from(line).length * 12), 32) + 16
    const height = lines.length * 18 + 8
    return [
      { ...geometry.bounds, title: '', color, kind: 'relation-path', lines: [] },
      {
        x: geometry.label.x - width / 2,
        y: geometry.label.y - height / 2,
        width,
        height,
        title,
        color,
        kind: 'relation-label',
        lines,
      },
    ]
  })
}
export const drawExportRelations = (
  xml: Document,
  root: Element,
  document: MindMapDocument,
  nodes: readonly LayoutNode[],
): void => {
  const positions = new Map(nodes.map((node) => [node.id, node]))
  const element = (
    name: string,
    attrs: Record<string, string | number>,
    parent = root,
  ): Element => {
    const node = xml.createElementNS('http://www.w3.org/2000/svg', name)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    parent.appendChild(node)
    return node
  }
  for (const [index, relation] of (document.relations ?? []).entries()) {
    const from = positions.get(relation.from),
      to = positions.get(relation.to)
    if (!from || !to) continue
    const color = relation.color ?? topicAppearance(document, relation.from).stroke
    const markerId = `export-arrow-${index}`
    const marker = element('marker', {
      id: markerId,
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: 'auto-start-reverse',
    })
    element('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }, marker)
    element('path', {
      d: relationLayoutGeometry(relation, from, to).path,
      fill: 'none',
      stroke: color,
      'stroke-width': relation.width ?? 2,
      ...(relation.dashed ? { 'stroke-dasharray': '6 4' } : {}),
      ...(relation.arrow === 'both' ? { 'marker-start': `url(#${markerId})` } : {}),
      ...(relation.arrow === 'none' ? {} : { 'marker-end': `url(#${markerId})` }),
    })
  }
}
