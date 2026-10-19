import { drawMetadataBadges } from '@renderer/export/metadata'
import { visualPath } from '@shared/sketch'
import { inkExtents, drawExportInk } from '@renderer/export/ink'
import { measureTopicContent } from '@layout/measure'
import { showsTopicNotes } from '@shared/topic-shapes'
import { wrappedTitle } from '@renderer/export/text'
import { drawTopicShape, drawTopicAppearanceContent } from '@renderer/export/topic-shapes'
import { translate } from '@renderer/i18n'
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
    throw new Error(translate('mapIsTooLargeMaximum16384Pixels'))
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
  const bounds = [
    ...layout.nodes,
    ...annotationExtents(annotations),
    ...structureExtents(layout),
    ...inkExtents(source),
  ]
  const margin = 48
  const minX = Math.min(...bounds.map((node) => node.x)) - margin
  const minY = Math.min(...bounds.map((node) => node.y)) - margin
  const width = Math.ceil(Math.max(...bounds.map((node) => node.x + node.width)) - minX + margin)
  const height = Math.ceil(Math.max(...bounds.map((node) => node.y + node.height)) - minY + margin)
  const xml = new DOMImplementation().createDocument('http://www.w3.org/2000/svg', 'svg', null)
  const root = xml.documentElement
  if (!root) throw new Error(translate('couldNotCreateSvgDocument'))
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
  drawExportInk(xml, root, source)
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
      d: visualPath(
        layoutEdgePath(edge, a, b, topic.style?.lineStyle === 'straight'),
        source.settings?.visualStyle,
        `edge:${edge.id}`,
      ),
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
    const content = drawTopicShape(
      element,
      group,
      topic,
      node.width,
      node.height,
      style.fill,
      isRoot
        ? source.settings?.visualStyle === 'sketch'
          ? style.color
          : style.fill
        : style.stroke,
      source.settings?.visualStyle,
      isRoot ||
        branchIndex !== undefined ||
        Boolean(topic.style?.fill) ||
        topic.style?.shape === 'sticky',
    )
    const body = element('g', { transform: `translate(${content.x} ${content.y})` }, group)
    const metadata = topic.metadata
    const hasBadges = [
      metadata?.task,
      metadata?.labels?.length,
      metadata?.link,
      metadata?.equation,
      metadata?.audioAssetId,
    ].some(Boolean)
    const previewHeight =
      showsTopicNotes(topic.style?.shape) && topic.notes
        ? 48
        : topic.style?.shape === 'image' && !topic.image
          ? 52
          : 0
    const footerHeight =
      (hasBadges ? 28 : 0) + (topic.notes || topic.attachments?.length ? 28 : 0) + previewHeight
    const bodyHeight = content.height - footerHeight
    const naturalHeight =
      measureTopicContent(topic.title, isRoot, style.fontSize, topic).height - footerHeight
    const markerLayout = drawMarkerIcons(
      xml,
      body,
      metadata,
      content.width,
      bodyHeight,
      style.color,
    )
    const centerX = markerLayout.contentX + markerLayout.contentWidth / 2
    const lines = wrappedTitle(
      topic.title,
      style.fontSize,
      topic.style?.width === undefined
        ? isRoot
          ? 280 - 56
          : 240 - 44
        : Math.max(style.fontSize, markerLayout.contentWidth - (isRoot ? 56 : 44)),
    )
    const lineHeight = Math.ceil(style.fontSize * 1.5)
    let contentY =
      (isRoot ? 14 : 10) + markerLayout.contentY + Math.max(0, (bodyHeight - naturalHeight) / 2)
    if (topic.image) {
      const asset = source.assets?.[topic.image.assetId]
      if (!asset) throw new Error(translate('exportImageResourceIsMissing'))
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
        body,
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
      body,
    )
    lines.forEach((line, index) =>
      element('tspan', { x: centerX, dy: index ? lineHeight : 0 }, text).appendChild(
        xml.createTextNode(xmlText(line || ' ')),
      ),
    )
    drawTopicAppearanceContent(
      element,
      body,
      topic,
      centerX,
      Math.min(content.width - 32, 224),
      bodyHeight + (topic.style?.shape === 'image' ? 28 : 14),
      style.color,
      appearance.fontFamily,
    )
    drawMetadataBadges(
      xml,
      body,
      metadata,
      content.width,
      bodyHeight + previewHeight + 18,
      style.color,
      appearance.fontFamily,
    )
    const details = [
      topic.notes ? translate('notes') : '',
      topic.attachments?.length
        ? translate('value0Attachments', { value0: topic.attachments.length })
        : '',
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
          x: content.width / 2,
          y: content.height - 10,
          'text-anchor': 'middle',
          fill: style.color,
          'font-family': appearance.fontFamily,
          'font-size': 11,
        },
        body,
      ).appendChild(xml.createTextNode(details))
  }
  drawExportAnnotations(xml, root, source, layout.nodes, annotations, 'overlay')
  const svg = new XMLSerializer().serializeToString(xml)
  if (new TextEncoder().encode(svg).length > EXPORT_LIMITS.svgBytes)
    throw new Error(translate('exportedSvgExceeds40MibSplitThe'))
  return { svg, width, height }
}
