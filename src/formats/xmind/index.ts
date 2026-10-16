import { type MindMapSheet, type MindMapWorkbook, type Side, type Topic } from '../../core'
import { truncateSheetName } from '../../core/workbook'
import { readArchive } from '../archive'
import type { ImportedWorkbook } from '../types'
import { validateBoundedWorkbook } from '../trelyx/validation'
import { idAllocator, list, record, text, topicIds, Warnings, type SourceRecord } from './common'
import { parseLegacy } from './legacy'
import { importStyle } from './styles'

const topicFields = new Set(['id', 'title', 'children', 'branch', 'style', 'structureClass'])
const sheetFields = new Set(['id', 'title', 'rootTopic'])

/** Import supported XMind content only; all discarded presentation/features are reported. */
export function importXmind(bytes: Uint8Array): ImportedWorkbook {
  const entries = readArchive(bytes)
  const warnings = new Warnings()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let sheets: unknown[]
  const modern = entries.get('content.json')
  if (modern !== undefined) {
    let parsed: unknown
    try {
      parsed = JSON.parse(decoder.decode(modern)) as unknown
    } catch {
      throw new Error('XMind content.json 不是有效的 UTF-8 JSON')
    }
    sheets = list(parsed, '画布')
  } else {
    const legacy = entries.get('content.xml')
    if (!legacy) throw new Error('XMind 文件缺少 content.json 或 content.xml')
    const styles = entries.get('styles.xml')
    sheets = parseLegacy(
      decoder.decode(legacy),
      styles ? decoder.decode(styles) : undefined,
      warnings,
    )
  }
  if (sheets.length === 0 || sheets.length > 128) throw new Error('XMind 画布数须为 1 至 128')
  const reservedSheetIds = new Set(
    sheets
      .map((sheet) => record(sheet, '画布').id)
      .filter((id): id is string => typeof id === 'string'),
  )
  const convert = new WorkbookImporter(warnings, reservedSheetIds)
  const imported = sheets.map((sheet, index) => convert.sheet(record(sheet, '画布'), index))
  const workbook: MindMapWorkbook = {
    format: 'trelyx',
    version: 2,
    id: 'xmind-import',
    title: imported[0]?.name ?? 'XMind',
    sheets: imported,
  }
  for (const path of entries.keys()) {
    if (/^(?:attachments|resources)\//i.test(path)) warnings.add('未导入 XMind 附件资源')
  }
  validateBoundedWorkbook(workbook)
  return { workbook, warnings: warnings.values() }
}

class WorkbookImporter {
  private count = 0
  private readonly sheetId: (value: unknown) => string

  constructor(
    private readonly warnings: Warnings,
    reservedSheetIds: ReadonlySet<string>,
  ) {
    this.sheetId = idAllocator('xmind-sheet', warnings, reservedSheetIds)
  }

  sheet(source: SourceRecord, index: number): MindMapSheet {
    this.warnings.omitted(source, sheetFields)
    const originalName = text(source.title, '画布标题', `画布 ${index + 1}`)
    const name = truncateSheetName(originalName).trim()
      ? truncateSheetName(originalName)
      : `画布 ${index + 1}`
    if (name !== originalName) this.warnings.add('画布名称已调整为 Trelyx 支持的长度或默认名称')
    const id = this.sheetId(source.id)
    const topics: Record<string, Topic> = {}
    const rootTopic = record(source.rootTopic, '中心主题')
    const allocate = idAllocator(`xmind-topic-${index + 1}`, this.warnings, topicIds(rootTopic))
    const rootId = this.topic(rootTopic, topics, allocate, 0, 'right')
    const root = topics[rootId]
    if (!root) throw new Error('XMind 缺少中心主题')
    return {
      id,
      name,
      document: { format: 'trelyx', version: 1, id, title: root.title, rootId, topics },
    }
  }

  private topic(
    source: SourceRecord,
    topics: Record<string, Topic>,
    allocate: (value: unknown) => string,
    depth: number,
    side: Side,
  ): string {
    this.reserve(depth)
    const id = allocate(source.id)
    const title = text(source.title, '主题标题')
    const style = importStyle(source.style, this.warnings)
    this.warnings.omitted(source, topicFields)
    if (source.structureClass !== undefined) this.warnings.add('XMind 布局已转换为 Trelyx 左右布局')
    if (source.branch !== undefined && source.branch !== 'folded' && source.branch !== 'expanded')
      this.warnings.add('不支持的 XMind 折叠状态已展开')
    const children = source.children === undefined ? {} : record(source.children, 'children')
    // Reserve this ID before descending so duplicate parent/child IDs cannot overwrite topics.
    topics[id] = { id, title, children: [], collapsed: source.branch === 'folded', side }
    const childIds = list(children.attached, 'children.attached').map((child, index) =>
      this.topic(
        record(child, '子主题'),
        topics,
        allocate,
        depth + 1,
        depth === 0 ? (index % 2 === 0 ? 'right' : 'left') : side,
      ),
    )
    for (const [kind, entries] of Object.entries(children)) {
      if (kind === 'attached') continue
      const extra = list(entries, `children.${kind}`)
      if (extra.length === 0) continue
      this.reserve(depth + 1)
      const groupId = allocate(undefined)
      const kindName =
        kind === 'detached'
          ? '游离'
          : kind === 'summary'
            ? '概要'
            : kind === 'callout'
              ? '标注'
              : '其他类型'
      const title = `导入的${kindName}主题`
      const preserved = extra.map((child) =>
        this.topic(record(child, '附加主题'), topics, allocate, depth + 2, side),
      )
      topics[groupId] = { id: groupId, title, children: preserved, collapsed: false, side }
      childIds.push(groupId)
      this.warnings.add(
        `XMind ${kindName}主题已保留为“${title}”分支，原位置或语义未保留`,
        extra.length,
      )
    }
    topics[id] = {
      id,
      title,
      children: childIds,
      collapsed: source.branch === 'folded',
      side,
      ...(style ? { style } : {}),
    }
    return id
  }

  private reserve(depth: number): void {
    if (depth >= 128) throw new Error('XMind 主题层级超过 128')
    if (++this.count > 20_000) throw new Error('XMind 主题数量超过 20000')
  }
}
