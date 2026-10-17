import { DOMImplementation, XMLSerializer, type Element } from '@xmldom/xmldom'
import type { MindMapDocument, Topic } from '@core'
import { layoutDocument, measureTopicImage } from '@layout'
import { xmlText } from '@formats/interchange/xml'
import { imageDimensions } from '@assets'
import {
  annotationExtents,
  drawExportAnnotations,
  exportAnnotations,
} from '@renderer/export/annotations'
import { documentAppearance, topicAppearance } from '@shared/appearance'
import { layoutEdgePath } from '@shared/layout-geometry'
import { drawMarkerIcons } from '@renderer/export/markers'
import { drawStructureGeometry, structureExtents } from '@renderer/export/structures'
export interface SheetSvg {
  svg: string
  width: number
  height: number
}
export const EXPORT_LIMITS = {
  svgBytes: 40 * 1024 * 1024,
  dimension: 16384,
  pixels: 40000000,
} as const
export const checkRasterSize = (width: number, height: number): void => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > EXPORT_LIMITS.dimension ||
    height > EXPORT_LIMITS.dimension ||
    width * height > EXPORT_LIMITS.pixels
  )
    throw new Error(
      '导图过大，图片单边最多 16384 像素、总计最多 4000 万像素；请导出 SVG 或降低图片倍率',
    )
}
const wrappedTitle = (title: string, fontSize: number, maxWidth: number): string[] => {
  const lines = ['']
  let width = 0
  for (const character of title) {
    const size = (character.codePointAt(0) ?? 0) > 255 ? fontSize : fontSize * 0.62
    if (character === '\n' || (width + size > maxWidth && width > 0)) {
      lines.push('')
      width = 0
    }
    if (character !== '\n') {
      lines[lines.length - 1] = (lines.at(-1) ?? '') + character
      width += size
    }
  }
  return lines
}
/** Render the complete pure layout, including topics outside the viewport. */
export const renderSheetSvg = (document: MindMapDocument, includeCollapsed = false): SheetSvg => {
  const source = includeCollapsed
    ? {
        ...document,
        topics: Object.fromEntries(
          Object.values(document.topics).map((topic) => [topic.id, { ...topic, collapsed: false }]),
        ),
      }
    : document
  const layout = layoutDocument(source)
  const appearance = documentAppearance(source)
  const annotations = exportAnnotations(source, layout.nodes)
  const bounds = [...layout.nodes, ...annotationExtents(annotations), ...structureExtents(layout)]
  const margin = 48
  const minX = Math.min(...bounds.map((node) => node.x)) - margin
  const minY = Math.min(...bounds.map((node) => node.y)) - margin
  const width = Math.ceil(Math.max(...bounds.map((node) => node.x + node.width)) - minX + margin)
  const height = Math.ceil(Math.max(...bounds.map((node) => node.y + node.height)) - minY + margin)
  const xml = new DOMImplementation().createDocument('http://www.w3.org/2000/svg', 'svg', null)
  const root = xml.documentElement
  if (!root) throw new Error('无法创建 SVG 文档')
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
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  root.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  root.setAttribute('role', 'img')
  element('title', {}).appendChild(xml.createTextNode(xmlText(document.title)))
  element('rect', {
    x: minX,
    y: minY,
    width,
    height,
    fill: appearance.background,
  })
  drawExportAnnotations(xml, root, source, layout.nodes, annotations, 'underlay')
  drawStructureGeometry(xml, root, source, layout)
  const positions = new Map(layout.nodes.map((node) => [node.id, node]))
  const branchIndices = new Map(
    source.topics[source.rootId]?.children.map((id, index) => [id, index]),
  )
  for (const edge of layout.edges) {
    const a = positions.get(edge.source)
    const b = positions.get(edge.target)
    const topic = source.topics[edge.target]
    if (!a || !b || !topic || edge.routing === 'hidden') continue
    element('path', {
      d: layoutEdgePath(edge, a, b, topic.style?.lineStyle === 'straight'),
      fill: 'none',
      stroke: topicAppearance(source, topic.id).stroke,
      'stroke-width': topicAppearance(source, topic.id).lineWidth,
    })
  }
  for (const node of layout.nodes) {
    const topic: Topic | undefined = source.topics[node.id]
    if (!topic) continue
    const isRoot = topic.id === source.rootId
    const branchIndex = branchIndices.get(topic.id)
    const style = {
      ...topicAppearance(source, topic.id),
      fontSize: isRoot ? 24 : 16,
      bold: isRoot || branchIndex !== undefined,
      ...topic.style,
    }
    const group = element('g', { transform: `translate(${node.x} ${node.y})` })
    if (style.shape === 'ellipse')
      element(
        'ellipse',
        {
          cx: node.width / 2,
          cy: node.height / 2,
          rx: node.width / 2,
          ry: node.height / 2,
          fill: style.fill,
        },
        group,
      )
    else
      element(
        'rect',
        {
          width: node.width,
          height: node.height,
          rx: style.shape === 'rectangle' ? 0 : 14,
          fill: style.fill,
        },
        group,
      )
    const metadata = topic.metadata
    const hasBadges = [
      metadata?.task,
      metadata?.labels?.length,
      metadata?.link,
      metadata?.equation,
      metadata?.audioAssetId,
    ].some(Boolean)
    const bodyHeight =
      node.height - (hasBadges ? 28 : 0) - (topic.notes || topic.attachments?.length ? 28 : 0)
    const markerLayout = drawMarkerIcons(xml, group, metadata, node.width, bodyHeight, style.color)
    const centerX = markerLayout.contentX + markerLayout.contentWidth / 2
    const lines = wrappedTitle(
      topic.title,
      style.fontSize,
      topic.id === source.rootId ? 280 - 56 : 240 - 44,
    )
    const lineHeight = Math.ceil(style.fontSize * 1.5)
    let contentY = (topic.id === source.rootId ? 14 : 10) + markerLayout.contentY
    if (topic.image) {
      const asset = source.assets?.[topic.image.assetId]
      if (!asset) throw new Error('导出图片资源缺失')
      imageDimensions(asset)
      const size = measureTopicImage(topic.image)
      element(
        'image',
        {
          x: centerX - size.width / 2,
          y: contentY,
          ...size,
          href: `data:${asset.mimeType};base64,${asset.data}`,
        },
        group,
      )
      contentY += size.height + 12
    }
    const text = element(
      'text',
      {
        x: centerX,
        y: contentY + style.fontSize,
        'text-anchor': 'middle',
        fill: style.color,
        'font-family': appearance.fontFamily,
        'font-size': style.fontSize,
        'font-weight': style.bold ? 700 : 400,
        'font-style': style.italic ? 'italic' : 'normal',
        'xml:space': 'preserve',
      },
      group,
    )
    lines.forEach((line, index) =>
      element('tspan', { x: centerX, dy: index ? lineHeight : 0 }, text).appendChild(
        xml.createTextNode(xmlText(line || ' ')),
      ),
    )
    const metadataText = [
      metadata?.task
        ? `${metadata.task.done ? '✓' : '○'} ${metadata.task.progress ?? 0}%${metadata.task.priority ? ` P${metadata.task.priority}` : ''}`
        : '',
      metadata?.labels?.join('、') ?? '',
      metadata?.link ? '链接' : '',
      metadata?.equation ? '公式' : '',
      metadata?.audioAssetId ? '音频' : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const firstBadgeLine = wrappedTitle(metadataText, 10, Math.max(12, node.width - 24))[0] ?? ''
    const badge =
      firstBadgeLine === metadataText
        ? metadataText
        : `${Array.from(firstBadgeLine).slice(0, -1).join('')}…`
    const metadataDescription = [metadataText, metadata?.markers?.join(' ')]
      .filter(Boolean)
      .join(' · ')
    if (metadataDescription)
      element('title', {}, group).appendChild(xml.createTextNode(xmlText(metadataDescription)))
    if (metadataText)
      element(
        'text',
        {
          x: node.width / 2,
          y: bodyHeight + 18,
          'text-anchor': 'middle',
          fill: style.color,
          'font-family': appearance.fontFamily,
          'font-size': 10,
        },
        group,
      ).appendChild(xml.createTextNode(xmlText(badge)))
    const details = [
      topic.notes ? '备注' : '',
      topic.attachments?.length ? `${topic.attachments.length} 个附件` : '',
      !includeCollapsed && topic.collapsed && topic.children.length
        ? `+${topic.children.length}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ')
    if (details)
      element(
        'text',
        {
          x: node.width / 2,
          y: node.height - 10,
          'text-anchor': 'middle',
          fill: style.color,
          'font-family': appearance.fontFamily,
          'font-size': 11,
        },
        group,
      ).appendChild(xml.createTextNode(details))
  }
  drawExportAnnotations(xml, root, source, layout.nodes, annotations, 'overlay')
  const svg = new XMLSerializer().serializeToString(xml)
  if (new TextEncoder().encode(svg).length > EXPORT_LIMITS.svgBytes)
    throw new Error('导出 SVG 超过 40 MiB，请拆分画布')
  return { svg, width, height }
}
