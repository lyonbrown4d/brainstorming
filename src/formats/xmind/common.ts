export type SourceRecord = Record<string, unknown>

const featureNames: Readonly<Record<string, string>> = {
  notes: '备注',
  image: '图片',
  relationships: '关联线',
  markers: '图标',
  summaries: '概要范围',
  boundaries: '外框',
  href: '超链接或附件',
  labels: '标签',
  extensions: '扩展内容',
  numbering: '编号',
  position: '自由位置',
  width: '固定宽度',
  theme: '主题配色',
  style: '画布样式',
  settings: '画布设置',
  legend: '图例',
  topicPositioning: '主题定位设置',
  topicOverlapping: '主题重叠设置',
  class: '样式类别',
  'marker-refs': '图标',
  img: '图片',
  'xlink:href': '超链接或附件',
}

export function record(value: unknown, label: string): SourceRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`XMind ${label} 格式无效`)
  return value as SourceRecord
}

export function list(value: unknown, label: string): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`XMind ${label} 必须是列表`)
  return value as unknown[]
}

export function text(value: unknown, label: string, fallback = ''): string {
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new Error(`XMind ${label} 必须是文本`)
  return value
}

export class Warnings {
  private readonly counts = new Map<string, number>()

  add(message: string, count = 1): void {
    if (count > 0) this.counts.set(message, (this.counts.get(message) ?? 0) + count)
  }

  omitted(source: SourceRecord, supported: ReadonlySet<string>): void {
    for (const [key, value] of Object.entries(source)) {
      if (supported.has(key) || value === undefined || value === null) continue
      const feature = Object.hasOwn(featureNames, key) ? featureNames[key] : '扩展属性'
      const nested =
        typeof value === 'object' && !Array.isArray(value)
          ? Object.values(value as SourceRecord)
          : []
      const count = Array.isArray(value)
        ? value.length
        : nested.some(Array.isArray)
          ? nested.reduce<number>(
              (total, child) => total + (Array.isArray(child) ? child.length : 1),
              0,
            )
          : 1
      this.add(`未导入 XMind ${feature}`, count)
    }
  }

  values(): string[] {
    return Array.from(this.counts, ([message, count]) => `${message}（${count} 项）`)
  }
}

export function idAllocator(
  prefix: string,
  warnings: Warnings,
  reserved: ReadonlySet<string> = new Set(),
): (value: unknown) => string {
  const used = new Set<string>()
  let sequence = 0
  return (value) => {
    let id = typeof value === 'string' ? value : ''
    if (!id.trim() || ['__proto__', 'constructor', 'prototype'].includes(id) || used.has(id)) {
      do id = `${prefix}-${++sequence}`
      while (used.has(id) || reserved.has(id))
      warnings.add('缺失、重复或保留的 ID 已重新生成')
    }
    used.add(id)
    return id
  }
}

export function topicIds(root: SourceRecord): ReadonlySet<string> {
  const reserved = new Set<string>()
  const pending: { source: SourceRecord; depth: number }[] = [{ source: root, depth: 1 }]
  let count = 0
  while (pending.length > 0) {
    const item = pending.pop()
    if (!item) break
    if (++count > 20_000 || item.depth > 128)
      throw new Error('XMind 主题数量超过 20000 或层级超过 128')
    if (typeof item.source.id === 'string') reserved.add(item.source.id)
    const children = item.source.children
    if (children === undefined) continue
    for (const group of Object.values(record(children, 'children'))) {
      for (const child of list(group, '子主题'))
        pending.push({ source: record(child, '子主题'), depth: item.depth + 1 })
    }
  }
  return reserved
}
