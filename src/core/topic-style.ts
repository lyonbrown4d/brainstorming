import { TOPIC_SHAPES, type TopicStyle } from '@core/types'

const styleKeys = [
  'fill',
  'color',
  'fontSize',
  'bold',
  'italic',
  'shape',
  'lineStyle',
  'lineWidth',
] as const

/** Accept only explicit, bounded presentation values at the command/file boundary. */
export const validateTopicStyle: (value: unknown) => asserts value is TopicStyle = (
  value: unknown,
): asserts value is TopicStyle => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new Error('主题样式格式无效')
  const style = value as Record<string, unknown>
  for (const key of styleKeys) {
    if (!Object.hasOwn(style, key)) continue
    const entry = style[key]
    let valid: boolean
    switch (key) {
      case 'fill':
      case 'color':
        valid = typeof entry === 'string' && /^#[\da-f]{6}$/i.test(entry)
        break
      case 'fontSize':
        valid = typeof entry === 'number' && Number.isFinite(entry) && entry >= 12 && entry <= 32
        break
      case 'lineWidth':
        valid = typeof entry === 'number' && Number.isFinite(entry) && entry >= 1 && entry <= 6
        break
      case 'bold':
      case 'italic':
        valid = typeof entry === 'boolean'
        break
      case 'shape':
        valid = typeof entry === 'string' && TOPIC_SHAPES.some((shape) => shape === entry)
        break
      case 'lineStyle':
        valid = entry === 'curve' || entry === 'straight'
        break
    }
    if (!valid) throw new Error(`主题样式 ${key} 无效`)
  }
}

/** Copy only protocol fields; renderer caches and arbitrary CSS are never persisted. */
export const normalizeTopicStyle = (style: TopicStyle): TopicStyle => {
  return Object.fromEntries(
    styleKeys.filter((key) => Object.hasOwn(style, key)).map((key) => [key, style[key]]),
  )
}
