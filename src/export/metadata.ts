import type { Document, Element } from '@xmldom/xmldom'
import type { TopicMetadata } from '@core'
import { hasTaskDetails, PRIORITY_BADGE_PATH, PRIORITY_COLORS } from '@shared/taskPriority'
import { translate } from '@renderer/i18n'
import { wrappedTitle } from '@renderer/export/text'
import { xmlText } from '@formats/interchange/xml'

export const drawMetadataBadges = (
  xml: Document,
  parent: Element,
  metadata: TopicMetadata | undefined,
  width: number,
  y: number,
  color: string,
  font: string,
): void => {
  const task = metadata?.task
  const priority = task?.priority
  const caption = [
    task && hasTaskDetails(task)
      ? `${task.done ? '✓' : '○'}${task.progress === undefined ? '' : ` ${task.progress}%`}`
      : '',
    metadata?.labels?.join('、') ?? '',
    metadata?.link ? translate('link') : '',
    metadata?.equation ? translate('formula') : '',
    metadata?.audioAssetId ? translate('audio') : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const description = [
    priority ? translate('priorityValue0Label755', { value0: priority }) : '',
    caption,
    metadata?.markers?.join(' '),
  ]
    .filter(Boolean)
    .join(' · ')
  const element = (
    name: string,
    attrs: Record<string, string | number>,
    target = parent,
  ): Element => {
    const node = xml.createElementNS('http://www.w3.org/2000/svg', name)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    target.appendChild(node)
    return node
  }
  if (description) element('title', {}).appendChild(xml.createTextNode(xmlText(description)))
  const first = wrappedTitle(caption, 10, Math.max(12, width - (priority ? 50 : 24)))[0] ?? ''
  const text = first === caption ? caption : `${Array.from(first).slice(0, -1).join('')}…`
  const badgeWidth = priority ? 24 : 0
  const textWidth = Math.min(width - badgeWidth - 24, Array.from(text).length * 7)
  const x = Math.max(8, (width - badgeWidth - textWidth) / 2)
  if (priority) {
    const badge = element('svg', {
      x,
      y: y - 15,
      width: 20,
      height: 20,
      viewBox: '0 0 24 24',
      'data-priority': priority,
    })
    element(
      'path',
      {
        d: PRIORITY_BADGE_PATH,
        fill: PRIORITY_COLORS[priority],
        stroke: 'white',
        'stroke-width': 1,
      },
      badge,
    )
    element(
      'path',
      { d: 'M7 4h10', stroke: 'white', 'stroke-opacity': 0.35, 'stroke-linecap': 'round' },
      badge,
    )
    element(
      'text',
      {
        x: 12,
        y: 16.5,
        'text-anchor': 'middle',
        fill: 'white',
        'font-family': 'system-ui, sans-serif',
        'font-size': 13,
        'font-weight': 750,
      },
      badge,
    ).appendChild(xml.createTextNode(String(priority)))
  }
  if (text)
    element('text', {
      x: priority ? x + badgeWidth : width / 2,
      y,
      'text-anchor': priority ? 'start' : 'middle',
      fill: color,
      'font-family': font,
      'font-size': 10,
    }).appendChild(xml.createTextNode(xmlText(text)))
}
