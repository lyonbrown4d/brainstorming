import type { TopicStyle } from '../../core'
import { record, type SourceRecord, type Warnings } from './common'

type MutableStyle = { -readonly [Key in keyof TopicStyle]?: TopicStyle[Key] }

const shapes: Readonly<Record<string, NonNullable<TopicStyle['shape']>>> = {
  'org.xmind.topicShape.roundedRect': 'rounded',
  'org.xmind.topicShape.rect': 'rectangle',
  'org.xmind.topicShape.ellipse': 'ellipse',
}

export function importStyle(value: unknown, warnings: Warnings): TopicStyle | undefined {
  if (value === undefined) return undefined
  const source = record(value, 'style')
  const properties = record(source.properties ?? {}, 'style.properties')
  const result: MutableStyle = {}
  for (const [rawKey, entry] of Object.entries(properties)) {
    const key = rawKey.replace(/^(?:fo|svg|xmind):/, '')
    if (mapProperty(result, key, entry)) continue
    warnings.add('部分 XMind 样式不支持，已使用 Trelyx 默认样式')
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function mapProperty(style: MutableStyle, key: string, value: unknown): boolean {
  if ((key === 'fill' || key === 'color') && typeof value === 'string') {
    if (!/^#[\da-f]{6}$/i.test(value)) return false
    style[key] = value
    return true
  }
  if (key === 'font-size') {
    const size = typeof value === 'string' ? Number(value.replace(/(?:pt|px)$/, '')) : value
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 12 || size > 32) return false
    style.fontSize = size
    return true
  }
  if (
    key === 'font-weight' &&
    (typeof value === 'string' || typeof value === 'number') &&
    ['bold', 'normal', '400', '700'].includes(String(value))
  ) {
    style.bold = value === 'bold' || String(value) === '700'
    return true
  }
  if (key === 'font-style' && (value === 'normal' || value === 'italic')) {
    style.italic = value === 'italic'
    return true
  }
  if (key === 'shape-class' && typeof value === 'string' && Object.hasOwn(shapes, value)) {
    const shape = shapes[value]
    if (shape) {
      style.shape = shape
      return true
    }
  }
  return false
}

export function legacyStyleMap(value: SourceRecord): Map<string, unknown> {
  const result = new Map<string, unknown>()
  for (const group of ['styles', 'automatic-styles']) {
    const container = value[group]
    if (container === undefined) continue
    const styles = record(container, group).style
    for (const entry of styles === undefined ? [] : Array.isArray(styles) ? styles : [styles]) {
      const style = record(entry, 'style')
      if (typeof style.id === 'string')
        result.set(style.id, { properties: style['topic-properties'] ?? {} })
    }
  }
  return result
}
