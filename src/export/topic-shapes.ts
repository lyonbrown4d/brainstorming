import { sketchFillPath, topicOutlinePath, visualPath } from '@shared/sketch'
import type { Element } from '@xmldom/xmldom'
import type { SheetVisualStyle, Topic } from '@core'
import {
  showsTopicNotes,
  topicNotesPreview,
  topicShapeInsets,
  topicShapePath,
} from '@shared/topic-shapes'
import { xmlText } from '@formats/interchange/xml'
import { wrappedTitle } from '@renderer/export/text'
import { translate } from '@renderer/i18n'

export type SvgElementFactory = (
  name: string,
  attrs: Record<string, string | number>,
  parent: Element,
) => Element

export const drawTopicShape = (
  element: SvgElementFactory,
  group: Element,
  topic: Topic,
  width: number,
  height: number,
  fill: string,
  stroke: string,
  visualStyle?: SheetVisualStyle,
  sketchFill = true,
) => {
  const shape = topic.style?.shape ?? 'rounded'
  const attributes = { fill, stroke, 'stroke-width': 1.5 }
  if (visualStyle === 'sketch' && shape !== 'text') {
    const outline = topicOutlinePath(shape, width, height)
    element('path', { d: outline, fill, stroke: 'none' }, group)
    if (sketchFill)
      element(
        'path',
        {
          d: sketchFillPath(outline, `topic:${topic.id}`),
          fill: 'none',
          stroke,
          'stroke-width': 0.8,
          'stroke-opacity': 0.1,
          'stroke-linecap': 'round',
          'data-sketch': 'fill',
        },
        group,
      )
    element(
      'path',
      {
        d: visualPath(outline, visualStyle, `topic:${topic.id}`),
        ...attributes,
        fill: 'none',
        'data-sketch': 'outline',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
      group,
    )
  } else if (shape === 'ellipse' || shape === 'circle')
    element(
      'ellipse',
      { cx: width / 2, cy: height / 2, rx: width / 2, ry: height / 2, ...attributes },
      group,
    )
  else if (shape !== 'text')
    element('path', { d: topicShapePath(shape, width, height), ...attributes }, group)
  if (shape === 'sticky')
    element(
      'path',
      {
        d: visualPath(
          `M${width * 0.84} ${height} V${height * 0.84} H${width}`,
          visualStyle,
          `topic:${topic.id}:fold`,
        ),
        fill: 'none',
        stroke,
      },
      group,
    )
  if (shape === 'card')
    element(
      'path',
      {
        d: visualPath(
          `M${width * 0.08} ${height * 0.12} H${width * 0.92}`,
          visualStyle,
          `topic:${topic.id}:header`,
        ),
        fill: 'none',
        stroke,
        'stroke-width': 3,
      },
      group,
    )
  const inset = topicShapeInsets(shape)
  const x = width * inset.x
  const y = height * inset.y
  return { x, y, width: width - x * 2, height: height - y * 2 }
}

/** Notes are reused from the topic; this preview never changes the stored body. */
export const drawTopicAppearanceContent = (
  element: SvgElementFactory,
  group: Element,
  topic: Topic,
  x: number,
  width: number,
  y: number,
  color: string,
  fontFamily: string,
): void => {
  const preview =
    showsTopicNotes(topic.style?.shape) && topic.notes ? topicNotesPreview(topic.notes) : ''
  const missingImage = topic.style?.shape === 'image' && !topic.image
  if (!preview && !missingImage) return
  const text = element(
    'text',
    { x, y, fill: color, 'text-anchor': 'middle', 'font-size': 11, 'font-family': fontFamily },
    group,
  )
  const lines = wrappedTitle(preview || translate('addImage'), 11, Math.max(20, width))
  lines.slice(0, 2).forEach((line, index) => {
    const span = element('tspan', { x, dy: index ? 16 : 0 }, text)
    span.textContent = xmlText(
      index === 1 && lines.length > 2 ? `${Array.from(line).slice(0, -1).join('')}…` : line,
    )
  })
}
