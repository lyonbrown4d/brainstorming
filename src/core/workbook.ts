import { validateWorkbookLinks } from '@core/workbook-links'
import { createDocument, documentData } from '@core/document'
import type { MindMapDocument, MindMapSheet, MindMapWorkbook } from '@core/types'
import { assertId, validateDocument } from '@core/validation'
import { MAX_DOCUMENT_ASSET_BYTES, referencedAssetIds } from '@core/topic-content'

const nameSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })

const nameCharacters = (value: string): string[] => {
  return Array.from(nameSegmenter.segment(value), ({ segment }) => segment)
}

export const truncateSheetName = (value: string, length = 80): string => {
  return nameCharacters(value).slice(0, length).join('')
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
}

const own = (value: Record<string, unknown>, key: string): unknown => {
  return Object.hasOwn(value, key) ? value[key] : undefined
}

export const assertSheetName: (value: unknown) => asserts value is string = (
  value: unknown,
): asserts value is string => {
  if (typeof value !== 'string' || value.trim().length === 0 || nameCharacters(value).length > 80)
    throw new Error('画布名称须为 1 至 80 个字符')
}

export const validateSheet: (value: unknown) => asserts value is MindMapSheet = (
  value: unknown,
): asserts value is MindMapSheet => {
  if (!isRecord(value)) throw new Error('画布格式无效')
  assertId(own(value, 'id'))
  assertSheetName(own(value, 'name'))
  const document = own(value, 'document')
  validateDocument(document)
  assertId(document.id)
}

export const validateWorkbook: (value: unknown) => asserts value is MindMapWorkbook = (
  value: unknown,
): asserts value is MindMapWorkbook => {
  if (!isRecord(value) || own(value, 'format') !== 'brainstorming')
    throw new Error('文件不是 Brainstorming 工作簿')
  if (own(value, 'version') !== 2) throw new Error('不支持此 Brainstorming 工作簿版本')
  assertId(own(value, 'id'))
  if (typeof own(value, 'title') !== 'string') throw new Error('工作簿标题必须是文本')
  const sheets = own(value, 'sheets')
  if (!Array.isArray(sheets) || sheets.length === 0) throw new Error('工作簿至少需要一个画布')
  const ids = new Set<string>()
  const validatedSheets: MindMapSheet[] = []
  let assetBytes = 0
  for (const sheet of sheets) {
    validateSheet(sheet)
    validatedSheets.push(sheet)
    if (ids.has(sheet.id)) throw new Error(`画布 ${sheet.id} 已存在`)
    ids.add(sheet.id)
    for (const id of referencedAssetIds(sheet.document.topics)) {
      const data = sheet.document.assets?.[id]?.data ?? ''
      assetBytes += (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
      if (assetBytes > MAX_DOCUMENT_ASSET_BYTES) throw new Error('工作簿资源总量超过 24 MiB')
    }
  }
  validateWorkbookLinks(validatedSheets)
}

export const sheetData = (sheet: MindMapSheet): MindMapSheet => {
  return { id: sheet.id, name: sheet.name, document: documentData(sheet.document) }
}

const workbookData = (workbook: MindMapWorkbook): MindMapWorkbook => {
  return {
    format: 'brainstorming',
    version: 2,
    id: workbook.id,
    title: workbook.title,
    sheets: workbook.sheets.map(sheetData),
  }
}

export const createWorkbook = (
  document: MindMapDocument = createDocument(),
  title: string = document.title,
): MindMapWorkbook => {
  validateDocument(document)
  const truncatedTitle = truncateSheetName(document.title)
  const name = truncatedTitle.trim().length > 0 ? truncatedTitle : '画布 1'
  const workbook: MindMapWorkbook = {
    format: 'brainstorming',
    version: 2,
    id: document.id,
    title,
    sheets: [{ id: document.id, name, document: documentData(document) }],
  }
  validateWorkbook(workbook)
  return workbook
}

export const serializeWorkbook = (workbook: MindMapWorkbook): string => {
  validateWorkbook(workbook)
  return JSON.stringify(workbookData(workbook), null, 2)
}

export const deserializeWorkbook = (json: string): MindMapWorkbook => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  validateWorkbook(parsed)
  return workbookData(parsed)
}
