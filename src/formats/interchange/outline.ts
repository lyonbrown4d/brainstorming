import type { MindMapSheet, MindMapWorkbook, Topic } from '@core'
import { truncateSheetName } from '@core/workbook'
import { validateBoundedWorkbook } from '@formats/brainstorming/validation'

export interface OutlineTopic {
  title: string
  children: OutlineTopic[]
  notes?: string
}
export interface OutlineSheet {
  name: string
  root: OutlineTopic
}
export const MAX_TEXT_BYTES = 8 * 1024 * 1024

export const assertTextSize = (text: string): void => {
  if (text.length > MAX_TEXT_BYTES || new TextEncoder().encode(text).length > MAX_TEXT_BYTES)
    throw new Error('大纲文本不能超过 8 MiB')
}

export const outlineWorkbook = (sheets: readonly OutlineSheet[]): MindMapWorkbook => {
  if (!sheets.length || sheets.length > 128) throw new Error('大纲画布数须为 1 至 128')
  let count = 0
  const convert = (sheet: OutlineSheet): MindMapSheet => {
    const id = crypto.randomUUID()
    const topics: Record<string, Topic> = {}
    const visit = (source: OutlineTopic, depth: number): string => {
      if (depth > 128 || ++count > 20_000) throw new Error('大纲超过 128 层或 20000 个主题')
      const topicId = crypto.randomUUID()
      topics[topicId] = {
        id: topicId,
        title: source.title,
        collapsed: false,
        side: 'right',
        children: source.children.map((child) => visit(child, depth + 1)),
        ...(source.notes === undefined ? {} : { notes: source.notes }),
      }
      return topicId
    }
    const rootId = visit(sheet.root, 1)
    return {
      id,
      name: truncateSheetName(sheet.name).trim() || '导入大纲',
      document: {
        format: 'brainstorming',
        version: 1,
        id,
        title: sheet.root.title,
        rootId,
        topics,
      },
    }
  }
  const workbook: MindMapWorkbook = {
    format: 'brainstorming',
    version: 2,
    id: crypto.randomUUID(),
    title: sheets[0]?.name ?? '导入大纲',
    sheets: sheets.map(convert),
  }
  validateBoundedWorkbook(workbook)
  return workbook
}

export const exportSheets = (workbook: MindMapWorkbook, sheetId?: string): MindMapWorkbook => {
  validateBoundedWorkbook(workbook)
  if (!sheetId) return workbook
  const sheet = workbook.sheets.find((entry) => entry.id === sheetId)
  if (!sheet) throw new Error('导出的画布不存在')
  const topics = Object.fromEntries(
    Object.values(sheet.document.topics).map((topic) => {
      const link = topic.metadata?.link
      if (link?.kind !== 'topic' || link.sheetId === undefined || link.sheetId === sheet.id)
        return [topic.id, topic]
      const metadata = { ...topic.metadata }
      delete metadata.link
      return [topic.id, { ...topic, metadata }]
    }),
  )
  return { ...workbook, sheets: [{ ...sheet, document: { ...sheet.document, topics } }] }
}
