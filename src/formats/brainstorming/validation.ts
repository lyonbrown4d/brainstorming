import { validateWorkbook } from '@core/workbook'
import type { MindMapWorkbook } from '@core/types'

export const DOCUMENT_LIMITS = { topics: 20_000, depth: 128, sheets: 128 } as const

export const record = (value: unknown): Record<string, unknown> => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new Error('Brainstorming 文档结构无效')
  return value as Record<string, unknown>
}

export const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): void => {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('Brainstorming 文档包含当前版本不支持的内容')
}

/** Bound the whole workbook as well as individual tree depth before layout or editing. */
export const validateBoundedWorkbook: (value: unknown) => asserts value is MindMapWorkbook = (
  value: unknown,
): asserts value is MindMapWorkbook => {
  validateWorkbook(value)
  if (value.sheets.length > DOCUMENT_LIMITS.sheets) throw new Error('文档画布超过 128 个限制')
  let count = 0
  for (const sheet of value.sheets) {
    count += Object.keys(sheet.document.topics).length
    if (count > DOCUMENT_LIMITS.topics) throw new Error('文档主题超过 20000 个限制')
    const pending: { id: string; depth: number }[] = [{ id: sheet.document.rootId, depth: 1 }]
    while (pending.length > 0) {
      const item = pending.pop()
      if (!item) break
      if (item.depth > DOCUMENT_LIMITS.depth) throw new Error('主题层级超过 128 层限制')
      const topic = sheet.document.topics[item.id]
      if (!topic) throw new Error('主题不存在')
      for (const id of topic.children) pending.push({ id, depth: item.depth + 1 })
    }
  }
}
